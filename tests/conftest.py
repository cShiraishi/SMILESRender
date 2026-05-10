import os
import sys

import pytest

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("SKIP_MODELS", "1")

_here = os.path.dirname(__file__)
sys.path.insert(0, _here)  # make conftest importable as a module
sys.path.insert(0, os.path.join(_here, "..", "src"))


@pytest.fixture(scope="session")
def app():
    from routes import app as flask_app

    flask_app.config.update(
        {
            "TESTING": True,
            "WTF_CSRF_ENABLED": False,
        }
    )
    yield flask_app


@pytest.fixture(scope="session")
def client(app):
    return app.test_client()


# Common test molecules
ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
CAFFEINE = "Cn1cnc2c1c(=O)n(C)c(=O)n2C"
INVALID_SMILES = "not_a_smiles_XYZ!!!"
EMPTY_SMILES = ""
BENZENE = "c1ccccc1"
QUERCETIN = "O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12"
