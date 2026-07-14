"""
Command-line interface for the Accommodation Finder.
Provides a rich, interactive terminal experience.
"""

import sys
import re
import anthropic
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agent import AccommodationAgent

# ANSI color codes
class Colors:
    RESET      = "\033[0m"
    BOLD       = "\033[1m"
    DIM        = "\033[2m"
    ITALIC     = "\033[3m"
    UNDERLINE  = "\033[4m"

    BLACK      = "\033[30m"
    RED        = "\033[31m"
    GREEN      = "\033[32m"
    YELLOW     = "\033[33m"
    BLUE       = "\033[34m"
    MAGENTA    = "\033[35m"
    CYAN       = "\033[36m"
    WHITE      = "\033[37m"

    BG_BLUE    = "\033[44m"
    BG_CYAN    = "\033[46m"
    BG_DARK    = "\033[100m"

    BRIGHT_CYAN    = "\033[96m"
    BRIGHT_YELLOW  = "\033[93m"
    BRIGHT_GREEN   = "\033[92m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_WHITE   = "\033[97m"


def supports_color() -> bool:
    """Check if the terminal supports ANSI colors."""
    return hasattr(sys.stdout, 'isatty') and sys.stdout.isatty()


C = Colors() if supports_color() else type('NoColor', (), {k: '' for k in vars(Colors) if not k.startswith('_')})()


class CLI:
    """Interactive command-line interface."""

    COMMANDS = {
        "/help":        "Show this help message",
        "/preferences": "Show gathered preferences so far",
        "/reset":       "Start a new search from scratch",
        "/quit":        "Exit the application",
    }

    def __init__(self, Agent: "AccommodationAgent"):
        self.agent = Agent

    @staticmethod
    def banner() -> str:
        lines = [
            "",
            f"{C.BG_DARK}{C.BRIGHT_CYAN}{C.BOLD}  ┌─────────────────────────────────────────┐  {C.RESET}",
            f"{C.BG_DARK}{C.BRIGHT_CYAN}{C.BOLD}  │   🏨  StayFinder AI  ·  v1.0            │  {C.RESET}",
            f"{C.BG_DARK}{C.BRIGHT_CYAN}{C.BOLD}  │   Find Airbnbs & Hotels with AI         │  {C.RESET}",
            f"{C.BG_DARK}{C.BRIGHT_CYAN}{C.BOLD}  └─────────────────────────────────────────┘  {C.RESET}",
            "",
            f"{C.DIM}  Type {C.BRIGHT_YELLOW}/help{C.RESET}{C.DIM} for commands  ·  {C.BRIGHT_YELLOW}/quit{C.RESET}{C.DIM} to exit{C.RESET}",
            "",
        ]
        return "\n".join(lines)

    @staticmethod
    def error(msg: str) -> str:
        return f"{C.RED}✗ {msg}{C.RESET}"

    @staticmethod
    def info(msg: str) -> str:
        return f"{C.CYAN}ℹ {msg}{C.RESET}"

    @staticmethod
    def success(msg: str) -> str:
        return f"{C.BRIGHT_GREEN}✓ {msg}{C.RESET}"

    def _print_help(self):
        print(f"\n{C.BOLD}{C.BRIGHT_CYAN}Available Commands:{C.RESET}")
        for cmd, desc in self.COMMANDS.items():
            print(f"  {C.BRIGHT_YELLOW}{cmd:<15}{C.RESET} {C.DIM}{desc}{C.RESET}")
        print()

    def _print_preferences(self):
        if not self.agent.has_preferences():
            print(f"\n{C.DIM}  No preferences gathered yet. Start chatting!{C.RESET}\n")
            return
        print(f"\n{C.BOLD}{C.BRIGHT_CYAN}Current Preferences:{C.RESET}")
        for line in self.agent.get_preferences_summary().split("\n"):
            print(f"  {line}")
        print()

    def _clean_response_for_display(self, text: str) -> str:
        """Remove internal preference blocks from display."""
        return re.sub(r'<PREFERENCES>.*?</PREFERENCES>', '', text, flags=re.DOTALL).strip()

    def _format_ai_prefix(self) -> str:
        return f"\n{C.BRIGHT_MAGENTA}{C.BOLD}StayFinder:{C.RESET} "

    def _get_user_input(self) -> str:
        try:
            prompt = f"{C.BRIGHT_YELLOW}{C.BOLD}You:{C.RESET} "
            return input(prompt).strip()
        except (EOFError, KeyboardInterrupt):
            return "/quit"

    def run(self):
        """Main conversation loop."""
        # Send an initial greeting from the AI
        print(f"\n{C.DIM}Connecting to StayFinder AI...{C.RESET}")
        print(self._format_ai_prefix(), end="", flush=True)

        # Buffer to collect full response for preference extraction
        full_response = ""
        buffer = ""

        try:
            for chunk in self.agent.chat("Hello! I'm looking for a place to stay."):
                # Check if this is a preference block starting
                buffer += chunk
                if "<PREFERENCES>" in buffer:
                    # From here, suppress output until closing tag
                    continue
                if "</PREFERENCES>" in buffer:
                    buffer = re.sub(r'<PREFERENCES>.*?</PREFERENCES>', '', buffer, flags=re.DOTALL)
                    continue

                # Print non-preference content
                print(chunk, end="", flush=True)
                full_response += chunk

        except Exception as e:
            print(f"\n{self.error(f'Connection error: {e}')}")
            return

        print("\n")

        # Main loop
        while True:
            user_input = self._get_user_input()

            if not user_input:
                continue

            # Handle commands
            if user_input.lower() in ("/quit", "/exit", "/q"):
                print(f"\n{C.BRIGHT_CYAN}Thanks for using StayFinder AI! Safe travels! ✈️{C.RESET}\n")
                break

            if user_input.lower() == "/help":
                self._print_help()
                continue

            if user_input.lower() == "/preferences":
                self._print_preferences()
                continue

            if user_input.lower() == "/reset":
                self.agent.reset()
                print(f"\n{self.success('Search reset. Starting fresh!')}\n")
                print(self._format_ai_prefix(), end="", flush=True)
                for chunk in self.agent.chat("Hello! I'd like to start a new search."):
                    buffer += chunk
                    if "<PREFERENCES>" in buffer or "</PREFERENCES>" in buffer:
                        buffer = re.sub(r'<PREFERENCES>.*?</PREFERENCES>', '', buffer, flags=re.DOTALL)
                        continue
                    print(chunk, end="", flush=True)
                print("\n")
                continue

            # Regular chat message
            print(self._format_ai_prefix(), end="", flush=True)

            buffer = ""
            search_notified = False

            try:
                for chunk in self.agent.chat(user_input):
                    buffer += chunk

                    # Notify user when a web search is happening (heuristic)
                    if not search_notified and len(buffer) > 10 and len(buffer) < 100:
                        # Check if response seems delayed (search happening)
                        pass

                    # Handle preference blocks
                    if "<PREFERENCES>" in buffer and "</PREFERENCES>" not in buffer:
                        # Mid-stream, accumulate without printing
                        # Print the part before <PREFERENCES>
                        before_pref = buffer.split("<PREFERENCES>")[0]
                        if before_pref:
                            print(before_pref, end="", flush=True)
                            buffer = "<PREFERENCES>" + buffer.split("<PREFERENCES>", 1)[1]
                        continue

                    if "</PREFERENCES>" in buffer:
                        # Remove the entire block and print remaining
                        clean = re.sub(r'<PREFERENCES>.*?</PREFERENCES>', '', buffer, flags=re.DOTALL)
                        print(clean, end="", flush=True)
                        buffer = ""
                        continue

                    if "<PREFERENCES>" not in buffer:
                        print(buffer, end="", flush=True)
                        buffer = ""

            except anthropic.APIConnectionError:
                print(f"\n{self.error('Connection lost. Check your internet connection.')}\n")

            except anthropic.AuthenticationError:
                print(f"\n{self.error('Invalid API key. Please check your ANTHROPIC_API_KEY.')}\n")
                break
            
            except anthropic.RateLimitError:
                print(f"\n{self.error('Rate limit reached. Please wait a moment and try again.')}\n")
            
            except Exception as e:
                print(f"\n{self.error(f'Unexpected error: {e}')}\n")

            print("\n")

            # Show preferences reminder after first search
            if self.agent.search_performed and self.agent.has_preferences():
                pref_hint = f"{C.DIM}  (Type {C.BRIGHT_YELLOW}/preferences{C.RESET}{C.DIM} to review your search criteria){C.RESET}"
                print(pref_hint)
                self.agent.search_performed = False  # Only show once per search
                print()