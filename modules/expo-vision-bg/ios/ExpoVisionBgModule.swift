import ExpoModulesCore
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

enum VisionBgError: Error {
  case unsupported
  case badInput(String)
  case maskGenerationFailed
  case outputWriteFailed

  var localizedDescription: String {
    switch self {
    case .unsupported:
      return "Vision instance mask requires iOS 17+/supported SDK."
    case .badInput(let details):
      return "Invalid image input: \(details)"
    case .maskGenerationFailed:
      return "Vision failed to generate a foreground mask for this image."
    case .outputWriteFailed:
      return "Failed to write cutout PNG to temporary storage."
    }
  }
}

public class ExpoVisionBgModule: Module {
  private struct BrandMatch {
    let brand: String
    let confidence: Double
  }

  private static let thresholdKernel = CIColorKernel(source: """
  kernel vec4 thresholdMask(__sample mask, float threshold) {
    float value = max(mask.r, max(mask.g, mask.b));
    float alpha = value >= threshold ? 1.0 : 0.0;
    return vec4(alpha, alpha, alpha, alpha);
  }
  """)

  private static let antialiasMaskKernel = CIColorKernel(source: """
  kernel vec4 antialiasMask(__sample mask) {
    float value = clamp(max(mask.r, max(mask.g, mask.b)), 0.0, 1.0);
    float alpha = smoothstep(0.02, 0.98, value);
    return vec4(alpha, alpha, alpha, alpha);
  }
  """)

  private static let edgeDecontaminationKernel = CIColorKernel(source: """
  kernel vec4 decontaminateEdge(__sample source, __sample interiorColor, __sample alphaMask) {
    float alpha = clamp(max(alphaMask.r, max(alphaMask.g, alphaMask.b)), 0.0, 1.0);
    if (alpha <= 0.001) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    }

    float interiorAlpha = clamp(interiorColor.a, 0.0, 1.0);
    float partialEdge = (1.0 - smoothstep(0.92, 0.995, alpha)) * smoothstep(0.005, 0.08, alpha);
    float safeInterior = smoothstep(0.005, 0.05, interiorAlpha);
    vec3 safeRGB = mix(source.rgb, interiorColor.rgb, safeInterior);
    vec3 rgb = mix(source.rgb, safeRGB, partialEdge);
    return vec4(rgb, alpha);
  }
  """)

  private static let softThresholdKernel = CIColorKernel(source: """
  kernel vec4 softThresholdMask(__sample mask, float threshold, float softness) {
    float value = max(mask.r, max(mask.g, mask.b));
    float safeSoftness = max(softness, 0.0001);
    float alpha = smoothstep(threshold - safeSoftness, threshold + safeSoftness, value);
    return vec4(alpha, alpha, alpha, alpha);
  }
  """)

  private static let alphaRampKernel = CIColorKernel(source: """
  kernel vec4 alphaRampMask(__sample mask, float threshold, float softness) {
    float value = max(mask.r, max(mask.g, mask.b));
    float safeSoftness = max(softness, 0.0001);
    float low = max(0.0, threshold - safeSoftness);
    float high = min(1.0, threshold + safeSoftness);
    float alpha = smoothstep(low, high, value);
    return vec4(alpha, alpha, alpha, alpha);
  }
  """)

  private static let boundaryBandKernel = CIColorKernel(source: """
  kernel vec4 boundaryBandMask(__sample mask) {
    float value = clamp(max(mask.r, max(mask.g, mask.b)), 0.0, 1.0);
    float centered = abs(value - 0.5) * 2.0;
    float band = 1.0 - smoothstep(0.10, 0.52, centered);
    return vec4(band, band, band, band);
  }
  """)

  private static let edgeGuidedRefineKernel = CIColorKernel(source: """
  kernel vec4 edgeGuidedRefine(__sample mask, __sample edgeMap, __sample boundaryBand, float strength) {
    float alpha = clamp(max(mask.r, max(mask.g, mask.b)), 0.0, 1.0);
    float edge = clamp(max(edgeMap.r, max(edgeMap.g, edgeMap.b)), 0.0, 1.0);
    float band = clamp(max(boundaryBand.r, max(boundaryBand.g, boundaryBand.b)), 0.0, 1.0);
    float weight = clamp(edge * band * strength, 0.0, 1.0);
    float boosted = clamp(alpha + (alpha - 0.5) * edge * 0.55, 0.0, 1.0);
    float sharpened = smoothstep(0.34, 0.66, boosted);
    float refined = mix(alpha, sharpened, weight);
    return vec4(refined, refined, refined, refined);
  }
  """)

  private static let bandDifferenceKernel = CIColorKernel(source: """
  kernel vec4 bandDifference(__sample outerMask, __sample innerMask, float strength) {
    float outerValue = clamp(max(outerMask.r, max(outerMask.g, outerMask.b)), 0.0, 1.0);
    float innerValue = clamp(max(innerMask.r, max(innerMask.g, innerMask.b)), 0.0, 1.0);
    float band = clamp((outerValue - innerValue) * strength, 0.0, 1.0);
    return vec4(band, band, band, band);
  }
  """)

  private static let cleanupBlendMaskKernel = CIColorKernel(source: """
  kernel vec4 cleanupBlendMask(__sample boundaryBand, __sample alphaMask, __sample edgeMap, float blendStrength) {
    float band = clamp(max(boundaryBand.r, max(boundaryBand.g, boundaryBand.b)), 0.0, 1.0);
    float alpha = clamp(max(alphaMask.r, max(alphaMask.g, alphaMask.b)), 0.0, 1.0);
    float edge = clamp(max(edgeMap.r, max(edgeMap.g, edgeMap.b)), 0.0, 1.0);
    float safeInterior = smoothstep(0.05, 0.35, alpha);
    float edgeLimiter = 1.0 - smoothstep(0.72, 1.0, edge) * 0.35;
    float weight = clamp(band * safeInterior * blendStrength * edgeLimiter, 0.0, 1.0);
    return vec4(weight, weight, weight, weight);
  }
  """)

  public func definition() -> ModuleDefinition {
    Name("ExpoVisionBg")

    AsyncFunction("removeBackground") { (imageUri: String, options: [String: Any]?) -> [String: Any] in
      guard #available(iOS 17.0, *) else {
        throw VisionBgError.unsupported
      }

      let cgImage = try self.loadOrientedCGImage(from: imageUri)
      let threshold = self.clamp(self.doubleValue(options?["threshold"]), min: 0, max: 1, fallback: 0.64)
      let cleanupRadius = self.clampInt(self.doubleValue(options?["cleanupRadius"]), min: 0, max: 8, fallback: 2)
      let feather = self.clampInt(self.doubleValue(options?["feather"]), min: 0, max: 6, fallback: 0)
      let edgeTighten = self.clamp(self.doubleValue(options?["edgeTighten"]), min: 0, max: 1, fallback: 0.45)
      let edgePolish = self.clamp(self.doubleValue(options?["edgePolish"]), min: 0, max: 1, fallback: 0.5)
      let maskToAlpha = self.boolValue(options?["maskToAlpha"], fallback: true)
      let result = try self.generateCutout(
        cgImage: cgImage,
        threshold: threshold,
        cleanupRadius: cleanupRadius,
        feather: feather,
        edgeTighten: edgeTighten,
        edgePolish: edgePolish,
        maskToAlpha: maskToAlpha
      )

      var payload: [String: Any] = [
        "uri": result.outputUrl.absoluteString,
        "width": result.width,
        "height": result.height,
        "hasAlphaChannel": result.hasAlphaChannel,
        "hasTransparency": result.hasTransparency,
        "transparentPixelRatio": result.transparentPixelRatio,
        "transparentPixelCount": result.transparentPixelCount
      ]
      if let maskUrl = result.maskUrl {
        payload["maskUri"] = maskUrl.absoluteString
      }
      if let contentBounds = result.contentBounds {
        payload["contentBounds"] = [
          "x": contentBounds.origin.x,
          "y": contentBounds.origin.y,
          "width": contentBounds.size.width,
          "height": contentBounds.size.height
        ]
      }
      return payload
    }
    .runOnQueue(DispatchQueue.global(qos: .userInitiated))

    AsyncFunction("detectBrandLogo") { (imageUri: String) -> [String: Any] in
      let startedAt = CFAbsoluteTimeGetCurrent()
      let cgImage = try self.loadOrientedCGImage(from: imageUri)
      var matches = self.detectBrandCandidates(in: cgImage)

      if matches.isEmpty {
        matches = self.detectBrandCandidatesInRectangles(in: cgImage)
      }

      let elapsed = CFAbsoluteTimeGetCurrent() - startedAt
      if elapsed > 1.5 {
        print("[BrandDetect] timeout elapsed=\(elapsed)")
        return [
          "brand": NSNull(),
          "confidence": NSNull(),
          "candidates": []
        ]
      }

      guard let best = matches.max(by: { $0.confidence < $1.confidence }) else {
        print("[BrandDetect] no match")
        return [
          "brand": NSNull(),
          "confidence": NSNull(),
          "candidates": []
        ]
      }

      let candidates = matches
        .sorted(by: { $0.confidence > $1.confidence })
        .prefix(3)
        .map { ["brand": $0.brand, "confidence": $0.confidence] }

      print("[BrandDetect] result brand=\(best.brand) conf=\(best.confidence)")
      return [
        "brand": best.brand,
        "confidence": best.confidence,
        "candidates": candidates
      ]
    }
    .runOnQueue(DispatchQueue.global(qos: .userInitiated))
  }

  @available(iOS 17.0, *)
  private func generateCutout(
    cgImage: CGImage,
    threshold: Double,
    cleanupRadius: Int,
    feather: Int,
    edgeTighten: Double,
    edgePolish: Double,
    maskToAlpha: Bool
  ) throws -> (
    outputUrl: URL,
    maskUrl: URL?,
    contentBounds: CGRect?,
    width: Int,
    height: Int,
    hasAlphaChannel: Bool,
    hasTransparency: Bool,
    transparentPixelRatio: Double,
    transparentPixelCount: Int
  ) {
    let width = cgImage.width
    let height = cgImage.height

    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    guard
      let observation = request.results?.first as? VNInstanceMaskObservation
    else {
      throw VisionBgError.maskGenerationFailed
    }

    let instances = observation.allInstances
    guard !instances.isEmpty else {
      throw VisionBgError.maskGenerationFailed
    }

    let maskPixelBuffer = try observation.generateScaledMaskForImage(
      forInstances: instances,
      from: handler
    )

    let input = CIImage(cgImage: cgImage)
    let rawMask = CIImage(cvPixelBuffer: maskPixelBuffer)
    print("[VisionBG] mask params: threshold=\(threshold), radius=\(cleanupRadius), feather=\(feather), edgeTighten=\(edgeTighten), edgePolish=\(edgePolish), maskToAlpha=\(maskToAlpha)")
    let masks = self.processedMaskImages(
      rawMask,
      to: input.extent,
      threshold: Float(threshold),
      cleanupRadius: cleanupRadius,
      feather: feather,
      edgeTighten: Float(edgeTighten),
      maskToAlpha: maskToAlpha
    )
    let mask = masks.alphaMask
    print("[VisionBG] mask image generated extent=\(mask.extent)")
    let cutout = self.decontaminatedCutout(
      sourceImage: input,
      alphaMask: mask,
      interiorMask: masks.interiorMask,
      targetExtent: input.extent
    )
    print("[VisionBG] cutout image generated extent=\(cutout.extent)")

    let ciContext = CIContext(options: nil)
    guard let previewCGImage = ciContext.createCGImage(cutout, from: input.extent) else {
      throw VisionBgError.maskGenerationFailed
    }

    let previewAlphaInfo = previewCGImage.alphaInfo
    print("[VisionBG] preview alpha info: \(previewAlphaInfo.rawValue)")
    assert(self.hasAlpha(previewAlphaInfo), "Vision output should preserve alpha")

    let outputUrl = try self.writePngImage(
      cutout,
      extent: input.extent,
      prefix: "vision-cutout",
      context: ciContext
    )
    let maskUrl = try self.writePngImage(
      mask,
      extent: input.extent,
      prefix: "vision-mask",
      context: ciContext
    )

    print("[VisionBG] output written outputUrl=\(outputUrl.absoluteString) maskUrl=\(maskUrl.absoluteString)")

    let exportedCutout = try self.loadOrientedCGImage(from: outputUrl.absoluteString)
    let exportedAlphaInfo = exportedCutout.alphaInfo
    print("[VisionBG] exported alpha info: \(exportedAlphaInfo.rawValue)")
    let transparency = self.transparencyStats(for: exportedCutout)
    let contentBounds = self.alphaBounds(for: exportedCutout)
    print("[VisionBG] transparency stats exportedImage=true hasTransparency=\(transparency.hasTransparency) ratio=\(transparency.ratio) count=\(transparency.transparentPixelCount)")

    return (
      outputUrl,
      maskUrl,
      contentBounds,
      width,
      height,
      self.hasAlpha(exportedAlphaInfo),
      transparency.hasTransparency,
      transparency.ratio,
      transparency.transparentPixelCount
    )
  }

  private func writePngImage(
    _ image: CIImage,
    extent: CGRect,
    prefix: String,
    context: CIContext
  ) throws -> URL {
    let outputUrl = FileManager.default.temporaryDirectory
      .appendingPathComponent("\(prefix)-\(UUID().uuidString)")
      .appendingPathExtension("png")
    do {
      try context.writePNGRepresentation(
        of: image.cropped(to: extent),
        to: outputUrl,
        format: .RGBA8,
        colorSpace: CGColorSpaceCreateDeviceRGB(),
        options: [:]
      )
    } catch {
      print("[VisionBG] png export failed prefix=\(prefix) error=\(error)")
      throw VisionBgError.outputWriteFailed
    }

    return outputUrl
  }

  private func transparencyStats(for image: CGImage) -> (
    hasTransparency: Bool,
    ratio: Double,
    transparentPixelCount: Int
  ) {
    let alphaInfo = image.alphaInfo
    guard hasAlpha(alphaInfo) else {
      return (false, 0, 0)
    }

    let width = image.width
    let height = image.height
    guard width > 0, height > 0 else {
      return (false, 0, 0)
    }

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bytesPerPixel = 4
    let bytesPerRow = bytesPerPixel * width
    let totalBytes = bytesPerRow * height
    var buffer = [UInt8](repeating: 0, count: totalBytes)

    let bitmapInfo = CGBitmapInfo.byteOrder32Big.union(
      CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
    )

    let rendered = buffer.withUnsafeMutableBytes { rawBuffer -> Bool in
      guard let baseAddress = rawBuffer.baseAddress,
            let context = CGContext(
              data: baseAddress,
              width: width,
              height: height,
              bitsPerComponent: 8,
              bytesPerRow: bytesPerRow,
              space: colorSpace,
              bitmapInfo: bitmapInfo.rawValue
            ) else {
        return false
      }

      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }

    guard rendered else {
      return (false, 0, 0)
    }

    var transparentPixelCount = 0
    var index = 3
    while index < buffer.count {
      if buffer[index] < 250 {
        transparentPixelCount += 1
      }
      index += bytesPerPixel
    }

    let totalPixels = width * height
    let ratio = totalPixels > 0 ? Double(transparentPixelCount) / Double(totalPixels) : 0
    return (transparentPixelCount > 0, ratio, transparentPixelCount)
  }

  private func alphaBounds(for image: CGImage) -> CGRect? {
    let alphaInfo = image.alphaInfo
    guard hasAlpha(alphaInfo) else {
      return nil
    }

    let width = image.width
    let height = image.height
    guard width > 0, height > 0 else {
      return nil
    }

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bytesPerPixel = 4
    let bytesPerRow = bytesPerPixel * width
    let totalBytes = bytesPerRow * height
    var buffer = [UInt8](repeating: 0, count: totalBytes)

    let bitmapInfo = CGBitmapInfo.byteOrder32Big.union(
      CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
    )

    let rendered = buffer.withUnsafeMutableBytes { rawBuffer -> Bool in
      guard let baseAddress = rawBuffer.baseAddress,
            let context = CGContext(
              data: baseAddress,
              width: width,
              height: height,
              bitsPerComponent: 8,
              bytesPerRow: bytesPerRow,
              space: colorSpace,
              bitmapInfo: bitmapInfo.rawValue
            ) else {
        return false
      }

      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }

    guard rendered else {
      return nil
    }

    var minX = width
    var minY = height
    var maxX = -1
    var maxY = -1

    for y in 0..<height {
      for x in 0..<width {
        let index = (y * bytesPerRow) + (x * bytesPerPixel) + 3
        if buffer[index] >= 12 {
          if x < minX { minX = x }
          if y < minY { minY = y }
          if x > maxX { maxX = x }
          if y > maxY { maxY = y }
        }
      }
    }

    guard maxX >= minX, maxY >= minY else {
      return nil
    }

    return CGRect(
      x: CGFloat(minX),
      y: CGFloat(minY),
      width: CGFloat(maxX - minX + 1),
      height: CGFloat(maxY - minY + 1)
    )
  }

  private func loadOrientedCGImage(from uri: String) throws -> CGImage {
    guard let inputUrl = normalizeFileUrl(uri) else {
      throw VisionBgError.badInput("The URI is not a valid local file path.")
    }

    guard let imageSource = CGImageSourceCreateWithURL(inputUrl as CFURL, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
      throw VisionBgError.badInput("Could not load image data.")
    }

    let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any]
    let orientationRaw = (properties?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: orientationRaw) ?? .up
    let orientedImage = CIImage(cgImage: cgImage).oriented(orientation)
    let ciContext = CIContext(options: nil)

    guard let orientedCGImage = ciContext.createCGImage(orientedImage, from: orientedImage.extent) else {
      throw VisionBgError.badInput("Could not apply image orientation.")
    }

    return orientedCGImage
  }

  @available(iOS 17.0, *)
  private func scaledMaskImage(_ mask: CIImage, to targetExtent: CGRect) -> CIImage {
    let fromExtent = mask.extent
    guard fromExtent.width > 0, fromExtent.height > 0 else {
      return mask.cropped(to: targetExtent)
    }

    let scaleX = targetExtent.width / fromExtent.width
    let scaleY = targetExtent.height / fromExtent.height

    let scaled = mask
      .applyingFilter("CILanczosScaleTransform", parameters: [
        kCIInputScaleKey: scaleX,
        kCIInputAspectRatioKey: scaleY / max(scaleX, 0.0001),
      ])
      .cropped(to: CGRect(
        x: targetExtent.origin.x,
        y: targetExtent.origin.y,
        width: targetExtent.width,
        height: targetExtent.height
      ))

    return scaled.cropped(to: targetExtent)
  }

  private func resampledImage(_ image: CIImage, to targetExtent: CGRect) -> CIImage {
    let fromExtent = image.extent
    guard fromExtent.width > 0, fromExtent.height > 0 else {
      return image.cropped(to: targetExtent)
    }

    let scaleX = targetExtent.width / fromExtent.width
    let scaleY = targetExtent.height / fromExtent.height

    let resampled = image
      .applyingFilter("CILanczosScaleTransform", parameters: [
        kCIInputScaleKey: scaleX,
        kCIInputAspectRatioKey: scaleY / max(scaleX, 0.0001),
      ])
      .cropped(to: CGRect(
        x: targetExtent.origin.x,
        y: targetExtent.origin.y,
        width: targetExtent.width,
        height: targetExtent.height
      ))

    return resampled.cropped(to: targetExtent)
  }

  @available(iOS 17.0, *)
  private func processedMaskImages(
    _ mask: CIImage,
    to targetExtent: CGRect,
    threshold: Float,
    cleanupRadius: Int,
    feather: Int,
    edgeTighten: Float,
    maskToAlpha: Bool
  ) -> (alphaMask: CIImage, interiorMask: CIImage) {
    let maxDimension = max(targetExtent.width, targetExtent.height)
    let workingScale: CGFloat
    if maxDimension <= 1600 {
      workingScale = 2.0
    } else if maxDimension <= 2600 {
      workingScale = 1.5
    } else {
      workingScale = 1.25
    }

    let workingExtent = CGRect(
      x: 0,
      y: 0,
      width: targetExtent.width * workingScale,
      height: targetExtent.height * workingScale
    )

    var result = scaledMaskImage(mask, to: workingExtent)

    // Vision instance masks are soft confidence masks, not finished alpha mattes.
    // Keep the confidence values, then convert them into a clean clothing cutout matte.
    if maskToAlpha {
      result = result
        .applyingFilter("CIMaskToAlpha")
        .cropped(to: workingExtent)
    }

    result = result
      .applyingFilter("CIColorControls", parameters: [
        kCIInputSaturationKey: 0,
        kCIInputBrightnessKey: 0,
        kCIInputContrastKey: 1.04
      ])
      .cropped(to: workingExtent)

    if cleanupRadius > 0 {
      result = result
        .applyingFilter("CIMedianFilter")
        .cropped(to: workingExtent)
    }

    var tightMask = thresholdMaskImage(result, threshold: threshold, to: workingExtent)

    // Edge tightening removes the halo-prone outer rim while keeping garment structure intact.
    let erosionRadius = edgeTightenErosionPixels(edgeTighten) * workingScale
    if erosionRadius > 0.05 {
      tightMask = tightMask
        .applyingFilter("CIMorphologyMinimum", parameters: [
          kCIInputRadiusKey: erosionRadius
        ])
        .cropped(to: workingExtent)
    }

    let interiorMask = workingScale > 1.01
      ? resampledImage(tightMask, to: targetExtent)
      : tightMask.cropped(to: targetExtent)

    let finalInteriorMask = thresholdMaskImage(interiorMask, threshold: 0.5, to: targetExtent)

    // Feathering the original source reintroduces contaminated semi-transparent RGB. Instead,
    // add a tiny clean antialias band around the already-tight matte.
    _ = feather
    return (
      antialiasedMaskImage(finalInteriorMask, to: targetExtent),
      finalInteriorMask
    )
  }

  private func thresholdMaskImage(
    _ image: CIImage,
    threshold: Float,
    to targetExtent: CGRect
  ) -> CIImage {
    guard let kernel = Self.thresholdKernel,
          let thresholded = kernel.apply(
            extent: targetExtent,
            arguments: [image, threshold]
          ) else {
      return image.cropped(to: targetExtent)
    }

    return thresholded.cropped(to: targetExtent)
  }

  private func edgeTightenErosionPixels(_ edgeTighten: Float) -> CGFloat {
    let clamped = CGFloat(max(0, min(1, edgeTighten)))
    guard clamped > 0 else {
      return 0
    }

    return min(1.4, 0.75 + clamped * 0.9)
  }

  private func antialiasedMaskImage(
    _ mask: CIImage,
    to targetExtent: CGRect
  ) -> CIImage {
    let smoothed = mask
      .applyingFilter("CIGaussianBlur", parameters: [
        kCIInputRadiusKey: 0.35
      ])
      .cropped(to: targetExtent)

    guard let kernel = Self.antialiasMaskKernel,
          let antialiased = kernel.apply(
            extent: targetExtent,
            arguments: [smoothed]
          ) else {
      return smoothed.cropped(to: targetExtent)
    }

    return antialiased.cropped(to: targetExtent)
  }

  private func decontaminatedCutout(
    sourceImage: CIImage,
    alphaMask: CIImage,
    interiorMask: CIImage,
    targetExtent: CGRect
  ) -> CIImage {
    let transparentBg = CIImage(color: .clear).cropped(to: targetExtent)
    // Dark cards expose white/gray edge RGB. Sample replacement color from the
    // tight interior mask, not from the already-composited cutout edge.
    let interiorOnly = transparentBg.applyingFilter("CIBlendWithMask", parameters: [
      kCIInputImageKey: sourceImage,
      kCIInputBackgroundImageKey: transparentBg,
      kCIInputMaskImageKey: interiorMask,
    ]).cropped(to: targetExtent)

    let interiorColor = interiorOnly
      .applyingFilter("CIPremultiplyAlpha")
      .applyingFilter("CIGaussianBlur", parameters: [
        kCIInputRadiusKey: 1.25
      ])
      .cropped(to: targetExtent)
      .applyingFilter("CIUnpremultiplyAlpha")
      .cropped(to: targetExtent)

    guard let kernel = Self.edgeDecontaminationKernel,
          let cleaned = kernel.apply(
            extent: targetExtent,
            arguments: [sourceImage, interiorColor, alphaMask]
          ) else {
      return transparentBg.applyingFilter("CIBlendWithMask", parameters: [
        kCIInputImageKey: sourceImage,
        kCIInputBackgroundImageKey: transparentBg,
        kCIInputMaskImageKey: interiorMask,
      ]).cropped(to: targetExtent)
    }

    return cleaned.cropped(to: targetExtent)
  }

  private func sourceEdgeMapImage(
    _ sourceImage: CIImage,
    to targetExtent: CGRect
  ) -> CIImage {
    let resampledSource = resampledImage(sourceImage, to: targetExtent)
      .applyingFilter("CIColorControls", parameters: [
        kCIInputSaturationKey: 0,
        kCIInputBrightnessKey: 0,
        kCIInputContrastKey: 1.05
      ])
      .cropped(to: targetExtent)

    let edges = resampledSource
      .applyingFilter("CIEdges", parameters: [
        kCIInputIntensityKey: 2.4
      ])
      .cropped(to: targetExtent)
      .applyingFilter("CIGaussianBlur", parameters: [
        kCIInputRadiusKey: 0.45
      ])
      .cropped(to: targetExtent)
      .applyingFilter("CIColorControls", parameters: [
        kCIInputSaturationKey: 0,
        kCIInputBrightnessKey: 0,
        kCIInputContrastKey: 2.3
      ])
      .cropped(to: targetExtent)

    return edges
  }

  private func refineMaskBoundaryWithSourceEdges(
    mask: CIImage,
    sourceImage: CIImage,
    targetExtent: CGRect,
    strength: Float
  ) -> CIImage {
    let edgeMap = sourceEdgeMapImage(sourceImage, to: targetExtent)

    guard let bandKernel = Self.boundaryBandKernel,
          let band = bandKernel.apply(
            extent: targetExtent,
            arguments: [mask]
          ),
          let refineKernel = Self.edgeGuidedRefineKernel,
          let refined = refineKernel.apply(
            extent: targetExtent,
            arguments: [mask, edgeMap, band, strength]
          ) else {
      return mask.cropped(to: targetExtent)
    }

    return refined
      .applyingFilter("CIGaussianBlur", parameters: [
        kCIInputRadiusKey: 0.22
      ])
      .cropped(to: targetExtent)
  }

  private func applyColorMatchedEdgeCleanup(
    cutout: CIImage,
    mask: CIImage,
    sourceImage: CIImage,
    edgePolish: Float,
    targetExtent: CGRect
  ) -> CIImage {
    let maxDimension = max(targetExtent.width, targetExtent.height)
    let clampedPolish = max(0, min(1, edgePolish))
    let polishOffset = clampedPolish - 0.5
    let edgeWidth: CGFloat
    if maxDimension <= 1000 {
      edgeWidth = 0.65
    } else if maxDimension <= 1800 {
      edgeWidth = 0.95
    } else if maxDimension <= 2600 {
      edgeWidth = 1.3
    } else {
      edgeWidth = 1.8
    }
    let adjustedEdgeWidth = max(0.5, min(2.1, edgeWidth * CGFloat(1.0 + polishOffset * 0.34)))
    let blurRadius = max(0.14, min(0.82, adjustedEdgeWidth * CGFloat(0.28 + polishOffset * 0.10)))
    let blendStrength: Float = max(0.48, min(0.82, (maxDimension >= 2200 ? 0.72 : 0.62) + polishOffset * 0.18))

    let innerMask = mask
      .applyingFilter("CIMorphologyMinimum", parameters: [
        kCIInputRadiusKey: adjustedEdgeWidth
      ])
      .cropped(to: targetExtent)

    let outerMask = mask
      .applyingFilter("CIMorphologyMaximum", parameters: [
        kCIInputRadiusKey: adjustedEdgeWidth
      ])
      .cropped(to: targetExtent)

    guard let bandKernel = Self.bandDifferenceKernel,
          let boundaryBand = bandKernel.apply(
            extent: targetExtent,
            arguments: [outerMask, innerMask, 1.6]
          )?.cropped(to: targetExtent) else {
      return cutout.cropped(to: targetExtent)
    }

    let smoothedBoundaryBand = boundaryBand
      .applyingFilter("CIGaussianBlur", parameters: [
        kCIInputRadiusKey: max(0.08, adjustedEdgeWidth * 0.22)
      ])
      .cropped(to: targetExtent)

    let edgeMap = sourceEdgeMapImage(sourceImage, to: targetExtent)

    let interiorColorSource = cutout
      .applyingFilter("CIMorphologyMaximum", parameters: [
        kCIInputRadiusKey: adjustedEdgeWidth
      ])
      .cropped(to: targetExtent)
      .applyingFilter("CIGaussianBlur", parameters: [
        kCIInputRadiusKey: blurRadius
      ])
      .cropped(to: targetExtent)

    guard let blendKernel = Self.cleanupBlendMaskKernel,
          let blendMask = blendKernel.apply(
            extent: targetExtent,
            arguments: [smoothedBoundaryBand, mask, edgeMap, blendStrength]
          )?.cropped(to: targetExtent) else {
      return cutout.cropped(to: targetExtent)
    }

    return interiorColorSource
      .applyingFilter("CIBlendWithAlphaMask", parameters: [
        kCIInputBackgroundImageKey: cutout,
        kCIInputMaskImageKey: blendMask
      ])
      .cropped(to: targetExtent)
  }

  private func largestConnectedComponentMaskImage(
    _ mask: CIImage,
    to targetExtent: CGRect
  ) -> CIImage? {
    let analysisMaxWidth: CGFloat = 1024
    let sourceExtent = mask.extent
    guard sourceExtent.width > 0, sourceExtent.height > 0 else {
      return nil
    }

    let analysisScale =
      sourceExtent.width > analysisMaxWidth
      ? analysisMaxWidth / sourceExtent.width
      : 1

    let analysisWidth = max(1, Int((sourceExtent.width * analysisScale).rounded()))
    let analysisHeight = max(1, Int((sourceExtent.height * analysisScale).rounded()))
    let analysisRect = CGRect(x: 0, y: 0, width: CGFloat(analysisWidth), height: CGFloat(analysisHeight))

    let preparedMask = mask
      .transformed(by: CGAffineTransform(scaleX: analysisScale, y: analysisScale))
      .cropped(to: analysisRect)

    let ciContext = CIContext(options: nil)
    guard let renderedMask = ciContext.createCGImage(preparedMask, from: analysisRect) else {
      return nil
    }

    let colorSpace = CGColorSpaceCreateDeviceGray()
    var pixels = [UInt8](repeating: 0, count: analysisWidth * analysisHeight)
    let didDraw = pixels.withUnsafeMutableBytes { rawBuffer -> Bool in
      guard let baseAddress = rawBuffer.baseAddress,
            let context = CGContext(
              data: baseAddress,
              width: analysisWidth,
              height: analysisHeight,
              bitsPerComponent: 8,
              bytesPerRow: analysisWidth,
              space: colorSpace,
              bitmapInfo: CGImageAlphaInfo.none.rawValue
            ) else {
        return false
      }

      context.interpolationQuality = .none
      context.draw(renderedMask, in: analysisRect)
      return true
    }

    guard didDraw else {
      return nil
    }

    let pixelCount = analysisWidth * analysisHeight
    var labels = [Int](repeating: 0, count: pixelCount)
    var componentAreas: [Int: Int] = [:]
    var currentLabel = 0
    var queue = [Int]()
    queue.reserveCapacity(pixelCount / 8)

    func isForeground(_ index: Int) -> Bool {
      pixels[index] >= 128
    }

    for index in 0..<pixelCount {
      if labels[index] != 0 || !isForeground(index) {
        continue
      }

      currentLabel += 1
      labels[index] = currentLabel
      queue.removeAll(keepingCapacity: true)
      queue.append(index)

      var area = 0
      var cursor = 0

      while cursor < queue.count {
        let current = queue[cursor]
        cursor += 1
        area += 1

        let x = current % analysisWidth
        let y = current / analysisWidth

        if x > 0 {
          let left = current - 1
          if labels[left] == 0 && isForeground(left) {
            labels[left] = currentLabel
            queue.append(left)
          }
        }
        if x + 1 < analysisWidth {
          let right = current + 1
          if labels[right] == 0 && isForeground(right) {
            labels[right] = currentLabel
            queue.append(right)
          }
        }
        if y > 0 {
          let up = current - analysisWidth
          if labels[up] == 0 && isForeground(up) {
            labels[up] = currentLabel
            queue.append(up)
          }
        }
        if y + 1 < analysisHeight {
          let down = current + analysisWidth
          if labels[down] == 0 && isForeground(down) {
            labels[down] = currentLabel
            queue.append(down)
          }
        }
      }

      componentAreas[currentLabel] = area
    }

    guard let largestLabel = componentAreas.max(by: { $0.value < $1.value })?.key else {
      return nil
    }

    var filteredPixels = [UInt8](repeating: 0, count: pixelCount)
    for index in 0..<pixelCount where labels[index] == largestLabel {
      filteredPixels[index] = 255
    }

    let outputData = Data(filteredPixels)
    guard let provider = CGDataProvider(data: outputData as CFData),
          let outputMask = CGImage(
            width: analysisWidth,
            height: analysisHeight,
            bitsPerComponent: 8,
            bitsPerPixel: 8,
            bytesPerRow: analysisWidth,
            space: colorSpace,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
          ) else {
      return nil
    }

    let restoredMask = CIImage(cgImage: outputMask)
      .transformed(by: CGAffineTransform(
        scaleX: targetExtent.width / CGFloat(analysisWidth),
        y: targetExtent.height / CGFloat(analysisHeight)
      ))
      .cropped(to: targetExtent)

    return restoredMask
  }

  private func hasAlpha(_ alphaInfo: CGImageAlphaInfo) -> Bool {
    switch alphaInfo {
    case .premultipliedLast, .premultipliedFirst, .last, .first:
      return true
    default:
      return false
    }
  }

  private func clamp(_ value: Double?, min: Double, max: Double, fallback: Double) -> Double {
    guard let value = value, value.isFinite else {
      return fallback
    }
    return Swift.max(min, Swift.min(max, value))
  }

  private func clampInt(_ value: Double?, min: Int, max: Int, fallback: Int) -> Int {
    guard let value = value, value.isFinite else {
      return fallback
    }
    let rounded = Int(value.rounded())
    return Swift.max(min, Swift.min(max, rounded))
  }

  private func doubleValue(_ value: Any?) -> Double? {
    switch value {
    case let number as Double:
      return number
    case let number as Float:
      return Double(number)
    case let number as Int:
      return Double(number)
    case let number as NSNumber:
      return number.doubleValue
    default:
      return nil
    }
  }

  private func boolValue(_ value: Any?, fallback: Bool) -> Bool {
    switch value {
    case let bool as Bool:
      return bool
    case let number as NSNumber:
      return number.boolValue
    default:
      return fallback
    }
  }

  private func normalizeFileUrl(_ raw: String) -> URL? {
    if let parsed = URL(string: raw), parsed.isFileURL {
      return parsed
    }

    if raw.hasPrefix("file://") {
      return URL(string: raw)
    }

    return URL(fileURLWithPath: raw)
  }

  private func detectBrandCandidates(in cgImage: CGImage) -> [BrandMatch] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.025
    request.recognitionLanguages = ["en-US"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      print("[BrandDetect] error text recognition \(error)")
      return []
    }

    guard let observations = request.results else {
      return []
    }

    var bestByBrand: [String: Double] = [:]
    for observation in observations {
      guard let candidate = observation.topCandidates(1).first else {
        continue
      }

      let text = candidate.string
      if let normalizedBrand = normalizeBrand(text) {
        let score = Double(candidate.confidence)
        let current = bestByBrand[normalizedBrand] ?? 0
        if score > current {
          bestByBrand[normalizedBrand] = score
        }
      }
    }

    return bestByBrand.map { BrandMatch(brand: $0.key, confidence: $0.value) }
  }

  private func detectBrandCandidatesInRectangles(in cgImage: CGImage) -> [BrandMatch] {
    let request = VNDetectRectanglesRequest()
    request.maximumObservations = 3
    request.minimumConfidence = 0.5
    request.minimumAspectRatio = 0.1

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      print("[BrandDetect] error rectangle detection \(error)")
      return []
    }

    guard let rectangles = request.results, !rectangles.isEmpty else {
      return []
    }

    var aggregated: [String: Double] = [:]
    let width = CGFloat(cgImage.width)
    let height = CGFloat(cgImage.height)

    for rectangle in rectangles {
      let boundingBox = rectangle.boundingBox
      let cropRect = CGRect(
        x: max(0, boundingBox.origin.x * width),
        y: max(0, (1 - boundingBox.origin.y - boundingBox.height) * height),
        width: min(width, boundingBox.width * width),
        height: min(height, boundingBox.height * height)
      ).integral

      guard cropRect.width > 8,
            cropRect.height > 8,
            let cropped = cgImage.cropping(to: cropRect) else {
        continue
      }

      for match in detectBrandCandidates(in: cropped) {
        let current = aggregated[match.brand] ?? 0
        if match.confidence > current {
          aggregated[match.brand] = match.confidence
        }
      }
    }

    return aggregated.map { BrandMatch(brand: $0.key, confidence: $0.value) }
  }

  private func normalizeBrand(_ raw: String) -> String? {
    let upper = raw
      .uppercased()
      .replacingOccurrences(of: "’", with: "'")
      .replacingOccurrences(of: "®", with: "")
      .replacingOccurrences(of: ".", with: " ")
      .replacingOccurrences(of: "-", with: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)

    let compact = upper.replacingOccurrences(of: " ", with: "")

    if upper.contains("JUST DO IT") || upper.contains("NIKE") {
      return "Nike"
    }
    if upper.contains("ADIDAS") {
      return "Adidas"
    }
    if upper.contains("PUMA") {
      return "Puma"
    }
    if upper.contains("H&M") || compact == "HM" {
      return "H&M"
    }
    if upper.contains("UNIQLO") {
      return "Uniqlo"
    }
    if upper.contains("ZARA") {
      return "Zara"
    }
    if upper.contains("LEVI'S") || compact.contains("LEVIS") {
      return "Levi’s"
    }
    if upper.contains("RALPH LAUREN") || upper.contains("POLO") {
      return "Polo Ralph Lauren"
    }

    return nil
  }
}
