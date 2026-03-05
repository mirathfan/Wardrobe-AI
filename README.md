# Wardrobe AI

**Wardrobe AI** is an AI-powered mobile application that helps users digitize their wardrobe and receive outfit recommendations based on their clothing inventory, occasion, and context.

The app combines **computer vision, mobile development, and AI intent parsing** to create a personal styling assistant that suggests outfits directly from a user's closet.

---

## Demo

**

Example flow:

1. User adds clothing items by taking photos  
2. Background is automatically removed using iOS Vision  
3. Items are stored in a digital wardrobe  
4. User can ask the AI for outfit suggestions  
5. Suggested outfits are logged into a calendar planner  

---

## Features

### Digital Wardrobe
- Add clothing items with photos
- Store and organize wardrobe items
- Filter and search clothing

### AI Outfit Suggestions
- Parse user prompts such as  
  `"suggest a work outfit"`
- Convert natural language into structured outfit intent
- Generate outfit suggestions from the user's closet


---

## AI Outfit Suggestion Pipeline

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant App as Wardrobe AI App
  participant Fn as Cloud Function (parseOutfitIntent)
  participant DB as Firestore
  U->>App: "date night outfit, it's cold"
  App->>Fn: prompt text
  Fn-->>App: intent JSON (occasion, color, layering...)
  App->>DB: fetch closet items + metadata
  DB-->>App: items list
  App-->>U: outfit suggestion (top picks)
  U->>App: save to calendar
  App->>DB: write outfit log
```
**Key engineering notes**
- On-device segmentation keeps photos private and reduces server cost.
- Firebase rules enforce user-scoped access (`users/{uid}/...`).
- Cloud Function converts free-text to structured intent for deterministic outfit logic.
- 
### Clothing Image Processing
- Background removal using **Apple Vision Framework**
- Clean segmentation of clothing items

### Outfit Planner
- Calendar-based outfit logging
- Track previously worn outfits

### Secure Cloud Backend
- Firebase Authentication
- Firestore database
- Secure storage rules

---

## Tech Stack

### Mobile
- React Native
- Expo
- TypeScript
- Expo Router

### Backend
- Firebase Authentication
- Firestore
- Firebase Cloud Functions
- Firebase Storage

### AI / Vision
- iOS Vision Framework (`VNGenerateForegroundInstanceMaskRequest`)
- AI intent parsing for outfit requests

---
## System Architecture

```mermaid
flowchart TD
  %% ============ Client ============
  subgraph Client["Mobile App (Expo + React Native)"]
    A1["Add Item Screen\n(camera / gallery)"]
    A2["Vision BG Removal\n(iOS Vision: VNGenerateForegroundInstanceMaskRequest)"]
    A3["Metadata Form\n(type, color, season, notes)"]
    A4["Closet View\n(search / filters)"]
    A5["AI Outfits\n(prompt → intent)"]
    A6["Calendar Planner\nlog outfits / history"]
  end

  %% ============ Backend ============
  subgraph Firebase["Firebase Backend"]
    B1["Auth\n(Firebase Auth)"]
    B2["Firestore\n(wardrobe items, outfits, logs)"]
    B3["Storage\n(images, cutouts)"]
    B4["Cloud Functions\nparseOutfitIntent"]
    B5["Security Rules\nFirestore + Storage"]
  end

  %% ============ Flows ============
  A1 --> A2 --> A3
  A3 -->|save item| B2
  A2 -->|upload cutout| B3

  A4 -->|query items| B2
  A5 -->|prompt| B4 -->|intent JSON| A5
  A5 -->|fetch closet| B2

  A6 -->|save log| B2
  B1 --> A4
  B1 --> A5
  B1 --> A6

  B5 -. protects .-> B2
  B5 -. protects .-> B3
```

## Architecture Overview

User Flow

```
User Photo
      ↓
Vision Framework (Background Removal)
      ↓
Clothing Item Stored in Firestore
      ↓
User Prompt → AI Intent Parser
      ↓
Outfit Generator
      ↓
Suggested Outfit
```

---

## Project Structure

```
app/
  (tabs)/
    add/
    closet/
    today/

components/
hooks/
constants/
scripts/

firebase rules/
firestore indexes
```

The project uses a **modular architecture** to separate UI components, business logic, and backend integration.

---

## Getting Started

### Install Dependencies

```
npm install
```

### Run the App

```
npx expo start
```

Then open the project using:

- iOS Simulator
- Android Emulator
- Expo Go

---

## Environment Setup

This project requires Firebase configuration.

Create environment variables for:

```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

---

## Roadmap

### V1
- Digital wardrobe inventory
- Clothing image segmentation
- AI outfit intent parsing
- Basic outfit suggestion engine
- Outfit planner calendar

### Future Features
- Automatic clothing metadata extraction
- Brand detection
- Weather-aware outfit suggestions
- Style learning AI
- Outfit visualization

---

## Why This Project

Most wardrobe apps only store clothing items.

**Wardrobe AI focuses on building an intelligent wardrobe assistant that understands context and generates outfit suggestions using AI.**

This project explores the intersection of:

- Mobile engineering
- Computer vision
- AI-powered user experiences

---

## Author

**Mir Athfan Ali**

Illinois Institute of Technology  
MAS Computer Science  

GitHub:  
https://github.com/mirathfan

---

## License

MIT License
