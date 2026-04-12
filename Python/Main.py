"""
AI-Powered Accommodation Finder
Helps users find Airbnb spaces and hotels based on their preferences.
"""

import os
import sys
from Agent import AccommodationAgent
from UI import CLI


def main():
    print(CLI.banner())

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(CLI.error("ANTHROPIC_API_KEY environment variable not set."))
        print(CLI.info("Set it with: export ANTHROPIC_API_KEY='your-key-here'"))
        sys.exit(1)

    Agent = AccommodationAgent(api_key=api_key)
    cli = CLI(Agent)
    cli.run()


if __name__ == "__main__":
    main()