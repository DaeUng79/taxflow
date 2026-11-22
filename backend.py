"""Compatibility for the former backend command and module imports."""

import importlib
import sys

__path__ = []
sys.modules["backend.app"] = importlib.import_module("app")

from app.main import main


if __name__ == "__main__":
    main()
