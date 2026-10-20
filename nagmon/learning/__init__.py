"""Adaptive learning engine for Nagmon (pure Python, no pygame/tuxemon).

See docs/kids/SDD_LEARNING.md and SDD_ARCHITECTURE.md sections 3-4.
"""

from nagmon.learning.content import (
    ContentError,
    ContentLibrary,
    GeneratorRegistry,
    Skill,
    default_registry,
)
from nagmon.learning.dashboard import DashboardData, Stat
from nagmon.learning.engine import (
    AnswerOutcome,
    Hint,
    LearningEngine,
    SubjectProgress,
)
from nagmon.learning.generators.common import GenContext
from nagmon.learning.learner import LearnerState
from nagmon.learning.model import (
    CheckResult,
    Choice,
    Figure,
    Question,
    check_answer,
    display_answer,
)

__all__ = [
    "AnswerOutcome",
    "CheckResult",
    "Choice",
    "ContentError",
    "ContentLibrary",
    "DashboardData",
    "Figure",
    "GenContext",
    "GeneratorRegistry",
    "Hint",
    "LearnerState",
    "LearningEngine",
    "Question",
    "Skill",
    "Stat",
    "SubjectProgress",
    "check_answer",
    "default_registry",
    "display_answer",
]
