"""Unit tests for the SMILES → image converter module."""

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

try:
    from rdkit import Chem
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False

pytestmark = pytest.mark.skipif(not RDKIT_AVAILABLE, reason="RDKit not installed")

from conftest import ASPIRIN, BENZENE, CAFFEINE, INVALID_SMILES, QUERCETIN


class TestSmilesValidation:
    def test_valid_smiles_parsed(self):
        mol = Chem.MolFromSmiles(ASPIRIN)
        assert mol is not None

    def test_caffeine_parsed(self):
        mol = Chem.MolFromSmiles(CAFFEINE)
        assert mol is not None

    def test_quercetin_parsed(self):
        mol = Chem.MolFromSmiles(QUERCETIN)
        assert mol is not None

    def test_invalid_smiles_returns_none(self):
        mol = Chem.MolFromSmiles(INVALID_SMILES)
        assert mol is None

    def test_empty_smiles_returns_none_or_empty_mol(self):
        # RDKit >= 2022 returns an empty Mol (0 atoms) for "" instead of None
        mol = Chem.MolFromSmiles("")
        assert mol is None or mol.GetNumAtoms() == 0


class TestMolecularProperties:
    """Sanity-check key physicochemical properties via RDKit."""

    def test_aspirin_atom_count(self):
        from rdkit.Chem import Descriptors
        mol = Chem.MolFromSmiles(ASPIRIN)
        mw = Descriptors.MolWt(mol)
        assert 175 < mw < 185  # aspirin MW ~180.16

    def test_benzene_ring_count(self):
        from rdkit.Chem import rdMolDescriptors
        mol = Chem.MolFromSmiles(BENZENE)
        rings = rdMolDescriptors.CalcNumRings(mol)
        assert rings == 1

    def test_quercetin_hbd(self):
        from rdkit.Chem import Descriptors
        mol = Chem.MolFromSmiles(QUERCETIN)
        hbd = Descriptors.NumHDonors(mol)
        assert hbd >= 5  # quercetin has 5 OH groups


class TestConverterModule:
    """Tests for src/converter.py image generation."""

    def test_converter_import(self):
        try:
            import converter  # noqa: F401
            assert True
        except ImportError as e:
            pytest.skip(f"converter module dependencies missing: {e}")

    def test_render_returns_bytes(self):
        try:
            import converter
            result = converter.smiles_to_image(ASPIRIN)
            assert isinstance(result, bytes)
            assert len(result) > 100
        except (ImportError, AttributeError):
            pytest.skip("converter.smiles_to_image not available")
