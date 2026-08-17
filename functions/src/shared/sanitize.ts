export function sanitizeUserInput(input: string): string {
  return input
    .trim()
    .replace(/\0/g, "")
    .slice(0, 2000);
}
