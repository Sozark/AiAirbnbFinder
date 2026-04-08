# AiAirbnbFinder
# 🏨 StayFinder AI

An AI-powered accommodation finder that helps you discover the perfect Airbnb space or hotel through natural conversation. Powered by Claude with real-time web search.

## Features

- **Conversational AI** — Chat naturally about your travel needs
- **Real-time Search** — Finds live Airbnb and hotel listings via web search
- **Smart Preference Tracking** — Remembers your requirements as you chat
- **Flexible Criteria** — Supports all key filters:
  - Number of guests (adults + children)
  - Budget per night (min/max)
  - Check-in / check-out dates
  - Accommodation type (Airbnb, hotel, or both)
  - Transportation needs (walkable, public transit, parking)
  - Nearby activities (beach, nightlife, hiking, museums, etc.)
  - Amenities (pool, kitchen, wifi, washer, AC, etc.)
  - Pet-friendly & accessibility requirements
  - Vibe (quiet/romantic/family-friendly/lively)

## Setup

### 1. Prerequisites
- Python 3.8+
- An [Anthropic API key](https://console.anthropic.com/)

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set your API key

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

Or add it to your shell profile (`~/.bashrc`, `~/.zshrc`):

```bash
echo 'export ANTHROPIC_API_KEY="your-api-key-here"' >> ~/.zshrc
source ~/.zshrc
```

### 4. Run

```bash
python main.py
```

## Usage

Just chat naturally! For example:

```
You: I'm looking for a place in Miami for 2 adults
StayFinder: Welcome! Miami is a fantastic choice 🌴 What dates are you thinking?

You: June 10-15
StayFinder: Got it — 5 nights in Miami. What's your budget per night?

You: Around $150-250, we'd love something walkable to the beach with a pool
StayFinder: [searches and returns real listings with prices, ratings, and links]
```

### Commands

| Command          | Description                          |
|-----------------|--------------------------------------|
| `/preferences`   | Show all gathered preferences        |
| `/reset`         | Start a new search from scratch      |
| `/help`          | Show available commands              |
| `/quit`          | Exit the application                 |

## Architecture

```
accommodation_finder/
├── main.py          # Entry point & API key validation
├── agent.py         # Core AI agent (Claude + web search)
├── preferences.py   # Structured preference data model
├── ui.py            # CLI interface with ANSI color support
├── requirements.txt # Python dependencies
└── README.md        # This file
```

### How It Works

1. **`agent.py`** — `AccommodationAgent` manages the conversation with Claude using a detailed system prompt. It enables the `web_search` tool so Claude can find real, current listings. After each response, it parses `<PREFERENCES>` JSON blocks that Claude emits to track structured user requirements.

2. **`preferences.py`** — `AccommodationPreferences` is a dataclass capturing all search criteria. It provides a formatted summary view and can detect when enough info exists to trigger a search.

3. **`ui.py`** — `CLI` handles the terminal interface: ANSI colors, streaming output, command handling, and filtering out internal `<PREFERENCES>` blocks from the displayed response.

4. **`main.py`** — Validates the API key and wires everything together.

## Example Conversation Flow

```
You: I need a pet-friendly place in Portland OR for 3 guests, budget $100-180/night
     near public transit, we love coffee shops and bookstores

StayFinder: [Searches for pet-friendly Airbnbs in Portland near transit]

        🏠 Hawthorne Craftsman Bungalow
        📍 Hawthorne District — steps from bus lines 14 & 70
        💰 $145/night · $725 est. total (5 nights)
        ⭐ 4.92 (148 reviews)
        ✨ Pet-friendly · Fenced yard · Full kitchen
        🚌 0.2 miles to MAX Light Rail
        🔗 airbnb.com/rooms/...

        [+ 3 more options]

You: Tell me more about the first one
StayFinder: [Searches for more details and reviews]
```

## Tips

- Be as specific as you like — the AI handles natural language
- Mention your interests even casually ("we're foodies", "big conference downtown")
- Ask follow-ups: "any closer to the airport?", "what about a hotel instead?"
- Use `/preferences` to verify the AI understood your requirements correctly
