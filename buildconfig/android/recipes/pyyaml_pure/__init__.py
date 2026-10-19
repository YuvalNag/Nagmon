# SPDX-License-Identifier: GPL-3.0
"""
PyYAML without its C speed-up (docs/kids/SDD_ANDROID.md §2.4).

PyPI has no Android wheel, and the C part needs libyaml. ``yaml`` falls
back to pure Python on its own when ``_yaml`` is missing, so this recipe
copies ``lib/yaml`` from the sdist.
"""

import shutil
from pathlib import Path

from pythonforandroid.recipe import Recipe


def install_pure_yaml(source: Path, site_packages: Path) -> None:
    target = Path(site_packages) / "yaml"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(Path(source) / "lib" / "yaml", target)


class PyYAMLPureRecipe(Recipe):
    version = "6.0.3"
    url = (
        "https://files.pythonhosted.org/packages/source/p/pyyaml/"
        "pyyaml-{version}.tar.gz"
    )
    name = "pyyaml_pure"
    depends = ["python3"]
    conflicts = ["pyyaml"]

    def should_build(self, arch):
        site = Path(self.ctx.get_site_packages_dir(arch))
        return not (site / "yaml" / "__init__.py").exists()

    def build_arch(self, arch):
        install_pure_yaml(
            Path(self.get_build_dir(arch.arch)),
            Path(self.ctx.get_site_packages_dir(arch)),
        )


recipe = PyYAMLPureRecipe()
