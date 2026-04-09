# SMILESRender: Full List of RDKit Descriptors

This document provides a comprehensive list of all **212** molecular descriptors calculated by the SMILESRender platform using the RDKit engine.

| # | Name | Description (RDKit Docstring) | Corresponding Function |
| :--- | :--- | :--- | :--- |
| 1 | **AvgIpc** | This returns the average information content of the coefficients of the characteristic | `Descriptors.AvgIpc` |
| 2 | **BCUT2D_CHGHI** | BCUT descriptor based on atomic charges (High) | `Descriptors.BCUT2D_CHGHI` |
| 3 | **BCUT2D_CHGLO** | BCUT descriptor based on atomic charges (Low) | `Descriptors.BCUT2D_CHGLO` |
| 4 | **BCUT2D_LOGPHI** | BCUT descriptor based on atomic logP (High) | `Descriptors.BCUT2D_LOGPHI` |
| 5 | **BCUT2D_LOGPLOW** | BCUT descriptor based on atomic logP (Low) | `Descriptors.BCUT2D_LOGPLOW` |
| 6 | **BCUT2D_MRHI** | BCUT descriptor based on atomic molar refractivity (High) | `Descriptors.BCUT2D_MRHI` |
| 7 | **BCUT2D_MRLOW** | BCUT descriptor based on atomic molar refractivity (Low) | `Descriptors.BCUT2D_MRLOW` |
| 8 | **BCUT2D_MWHI** | BCUT descriptor based on atomic weights (High) | `Descriptors.BCUT2D_MWHI` |
| 9 | **BCUT2D_MWLOW** | BCUT descriptor based on atomic weights (Low) | `Descriptors.BCUT2D_MWLOW` |
| 10 | **BalabanJ** | Calculate Balaban's J value for a molecule | `Descriptors.BalabanJ` |
| 11 | **BertzCT** | A topological index meant to quantify "complexity" of molecules. | `Descriptors.BertzCT` |
| 12 | **Chi0** | Randic Connectivity Index (order 0) | `Descriptors.Chi0` |
| 13 | **Chi0n** | Valence Path Connectivity Index (order 0) | `Descriptors.Chi0n` |
| 14 | **Chi0v** | Valence connectivity index (order 0) | `Descriptors.Chi0v` |
| 15 | **Chi1** | Randic Connectivity Index (order 1) | `Descriptors.Chi1` |
| 16 | **Chi1n** | Valence Path Connectivity Index (order 1) | `Descriptors.Chi1n` |
| 17 | **Chi1v** | Valence connectivity index (order 1) | `Descriptors.Chi1v` |
| 18 | **Chi2n** | Valence Path Connectivity Index (order 2) | `Descriptors.Chi2n` |
| 19 | **Chi2v** | Valence connectivity index (order 2) | `Descriptors.Chi2v` |
| 20 | **Chi3n** | Valence Path Connectivity Index (order 3) | `Descriptors.Chi3n` |
| 21 | **Chi3v** | Valence connectivity index (order 3) | `Descriptors.Chi3v` |
| 22 | **Chi4n** | Valence Path Connectivity Index (order 4) | `Descriptors.Chi4n` |
| 23 | **Chi4v** | Valence connectivity index (order 4) | `Descriptors.Chi4v` |
| 24 | **EState_VSA1** | EState VSA Descriptor 1 (-inf < x < -0.39) | `Descriptors.EState_VSA1` |
| 25 | **EState_VSA10** | EState VSA Descriptor 10 ( 9.17 <= x < 15.00) | `Descriptors.EState_VSA10` |
| 26 | **EState_VSA11** | EState VSA Descriptor 11 ( 15.00 <= x < inf) | `Descriptors.EState_VSA11` |
| 27 | **EState_VSA2** | EState VSA Descriptor 2 ( -0.39 <= x < 0.29) | `Descriptors.EState_VSA2` |
| 28 | **EState_VSA3** | EState VSA Descriptor 3 ( 0.29 <= x < 0.72) | `Descriptors.EState_VSA3` |
| 29 | **EState_VSA4** | EState VSA Descriptor 4 ( 0.72 <= x < 1.17) | `Descriptors.EState_VSA4` |
| 30 | **EState_VSA5** | EState VSA Descriptor 5 ( 1.17 <= x < 1.54) | `Descriptors.EState_VSA5` |
| 31 | **EState_VSA6** | EState VSA Descriptor 6 ( 1.54 <= x < 1.81) | `Descriptors.EState_VSA6` |
| 32 | **EState_VSA7** | EState VSA Descriptor 7 ( 1.81 <= x < 2.05) | `Descriptors.EState_VSA7` |
| 33 | **EState_VSA8** | EState VSA Descriptor 8 ( 2.05 <= x < 4.69) | `Descriptors.EState_VSA8` |
| 34 | **EState_VSA9** | EState VSA Descriptor 9 ( 4.69 <= x < 9.17) | `Descriptors.EState_VSA9` |
| 35 | **ExactMolWt** | The exact molecular weight of the molecule | `Descriptors.ExactMolWt` |
| 36 | **FpDensityMorgan1** | Molecular fingerprint density (Morgan radius 1) | `Descriptors.FpDensityMorgan1` |
| 37 | **FpDensityMorgan2** | Molecular fingerprint density (Morgan radius 2) | `Descriptors.FpDensityMorgan2` |
| 38 | **FpDensityMorgan3** | Molecular fingerprint density (Morgan radius 3) | `Descriptors.FpDensityMorgan3` |
| 39 | **FractionCSP3** | Fraction of carbons that are SP3 hybridized | `Descriptors.FractionCSP3` |
| 40 | **HallKierAlpha** | Hall-Kier Alpha value | `Descriptors.HallKierAlpha` |
| 41 | **HeavyAtomCount** | Number of heavy atoms in a molecule. | `Descriptors.HeavyAtomCount` |
| 42 | **HeavyAtomMolWt** | Average molecular weight ignoring hydrogens | `Descriptors.HeavyAtomMolWt` |
| 43 | **Ipc** | Information content of the coefficients of the characteristic | `Descriptors.Ipc` |
| 44 | **Kappa1** | Kier Kappa Shape Index 1 | `Descriptors.Kappa1` |
| 45 | **Kappa2** | Kier Kappa Shape Index 2 | `Descriptors.Kappa2` |
| 46 | **Kappa3** | Kier Kappa Shape Index 3 | `Descriptors.Kappa3` |
| 47 | **LabuteASA** | Labute's Approximate Surface Area | `Descriptors.LabuteASA` |
| 48 | **MaxAbsEStateIndex** | Maximum absolute E-state index | `Descriptors.MaxAbsEStateIndex` |
| 49 | **MaxAbsPartialCharge** | Maximum absolute partial charge | `Descriptors.MaxAbsPartialCharge` |
| 50 | **MaxEStateIndex** | Maximum E-state index | `Descriptors.MaxEStateIndex` |
| 51 | **MaxPartialCharge** | Maximum partial charge | `Descriptors.MaxPartialCharge` |
| 52 | **MinAbsEStateIndex** | Minimum absolute E-state index | `Descriptors.MinAbsEStateIndex` |
| 53 | **MinAbsPartialCharge** | Minimum absolute partial charge | `Descriptors.MinAbsPartialCharge` |
| 54 | **MinEStateIndex** | Minimum E-state index | `Descriptors.MinEStateIndex` |
| 55 | **MinPartialCharge** | Minimum partial charge | `Descriptors.MinPartialCharge` |
| 56 | **MolLogP** | Wildman-Crippen LogP value | `Descriptors.MolLogP` |
| 57 | **MolMR** | Wildman-Crippen MR value | `Descriptors.MolMR` |
| 58 | **MolWt** | The average molecular weight of the molecule | `Descriptors.MolWt` |
| 59 | **NHOHCount** | Number of NHs or OHs | `Descriptors.NHOHCount` |
| 60 | **NOCount** | Number of Nitrogens and Oxygens | `Descriptors.NOCount` |
| 61 | **NumAliphaticCarbocycles** | Number of aliphatic carbocycles | `Descriptors.NumAliphaticCarbocycles` |
| 62 | **NumAliphaticHeterocycles** | Number of aliphatic heterocycles | `Descriptors.NumAliphaticHeterocycles` |
| 63 | **NumAliphaticRings** | Number of aliphatic rings | `Descriptors.NumAliphaticRings` |
| 64 | **NumAromaticCarbocycles** | Number of aromatic carbocycles | `Descriptors.NumAromaticCarbocycles` |
| 65 | **NumAromaticHeterocycles** | Number of aromatic heterocycles | `Descriptors.NumAromaticHeterocycles` |
| 66 | **NumAromaticRings** | Number of aromatic rings | `Descriptors.NumAromaticRings` |
| 67 | **NumHAcceptors** | Number of Hydrogen Bond Acceptors | `Descriptors.NumHAcceptors` |
| 68 | **NumHDonors** | Number of Hydrogen Bond Donors | `Descriptors.NumHDonors` |
| 69 | **NumHeteroatoms** | Number of Heteroatoms | `Descriptors.NumHeteroatoms` |
| 70 | **NumRadicalElectrons** | Number of radical electrons | `Descriptors.NumRadicalElectrons` |
| 71 | **NumRings** | Number of Rings | `rdMolDescriptors.CalcNumRings` |
| 72 | **NumRotatableBonds** | Number of Rotatable Bonds | `Descriptors.NumRotatableBonds` |
| 73 | **NumSaturatedCarbocycles** | Number of saturated carbocycles | `Descriptors.NumSaturatedCarbocycles` |
| 74 | **NumSaturatedHeterocycles** | Number of saturated heterocycles | `Descriptors.NumSaturatedHeterocycles` |
| 75 | **NumSaturatedRings** | Number of saturated rings | `Descriptors.NumSaturatedRings` |
| 76 | **NumValenceElectrons** | Number of valence electrons | `Descriptors.NumValenceElectrons` |
| 77 | **PEOE_VSA1** | MOE Charge VSA Descriptor 1 (-inf < x < -0.30) | `Descriptors.PEOE_VSA1` |
| 78 | **PEOE_VSA2** | MOE Charge VSA Descriptor 2 (-0.30 <= x < -0.25) | `Descriptors.PEOE_VSA2` |
| 79 | **PEOE_VSA3** | MOE Charge VSA Descriptor 3 (-0.25 <= x < -0.20) | `Descriptors.PEOE_VSA3` |
| 80 | **PEOE_VSA4** | MOE Charge VSA Descriptor 4 (-0.20 <= x < -0.15) | `Descriptors.PEOE_VSA4` |
| 81 | **PEOE_VSA5** | MOE Charge VSA Descriptor 5 (-0.15 <= x < -0.10) | `Descriptors.PEOE_VSA5` |
| 82 | **PEOE_VSA6** | MOE Charge VSA Descriptor 6 (-0.10 <= x < -0.05) | `Descriptors.PEOE_VSA6` |
| 83 | **PEOE_VSA7** | MOE Charge VSA Descriptor 7 (-0.05 <= x < 0.00) | `Descriptors.PEOE_VSA7` |
| 84 | **PEOE_VSA8** | MOE Charge VSA Descriptor 8 ( 0.00 <= x < 0.05) | `Descriptors.PEOE_VSA8` |
| 85 | **PEOE_VSA9** | MOE Charge VSA Descriptor 9 ( 0.05 <= x < 0.10) | `Descriptors.PEOE_VSA9` |
| 86 | **PEOE_VSA10** | MOE Charge VSA Descriptor 10 ( 0.10 <= x < 0.15) | `Descriptors.PEOE_VSA10` |
| 87 | **PEOE_VSA11** | MOE Charge VSA Descriptor 11 ( 0.15 <= x < 0.20) | `Descriptors.PEOE_VSA11` |
| 88 | **PEOE_VSA12** | MOE Charge VSA Descriptor 12 ( 0.20 <= x < 0.25) | `Descriptors.PEOE_VSA12` |
| 89 | **PEOE_VSA13** | MOE Charge VSA Descriptor 13 ( 0.25 <= x < 0.30) | `Descriptors.PEOE_VSA13` |
| 90 | **PEOE_VSA14** | MOE Charge VSA Descriptor 14 ( 0.30 <= x < inf) | `Descriptors.PEOE_VSA14` |
| 91 | **QED** | Quantitative Estimation of Drug-likeness | `QED.qed` |
| 92 | **RingCount** | Number of chemical rings | `Descriptors.RingCount` |
| 93 | **SMR_VSA1** | MOE MR VSA Descriptor 1 (-inf < x < 1.29) | `Descriptors.SMR_VSA1` |
| 94 | **SMR_VSA2** | MOE MR VSA Descriptor 2 ( 1.29 <= x < 1.82) | `Descriptors.SMR_VSA2` |
| 95 | **SMR_VSA3** | MOE MR VSA Descriptor 3 ( 1.82 <= x < 2.24) | `Descriptors.SMR_VSA3` |
| 96 | **SMR_VSA4** | MOE MR VSA Descriptor 4 ( 2.24 <= x < 2.45) | `Descriptors.SMR_VSA4` |
| 97 | **SMR_VSA5** | MOE MR VSA Descriptor 5 ( 2.45 <= x < 2.75) | `Descriptors.SMR_VSA5` |
| 98 | **SMR_VSA6** | MOE MR VSA Descriptor 6 ( 2.75 <= x < 3.05) | `Descriptors.SMR_VSA6` |
| 99 | **SMR_VSA7** | MOE MR VSA Descriptor 7 ( 3.05 <= x < 3.63) | `Descriptors.SMR_VSA7` |
| 100 | **SMR_VSA8** | MOE MR VSA Descriptor 8 ( 3.63 <= x < 3.80) | `Descriptors.SMR_VSA8` |
| 101 | **SMR_VSA9** | MOE MR VSA Descriptor 9 ( 3.80 <= x < 4.00) | `Descriptors.SMR_VSA9` |
| 102 | **SMR_VSA10** | MOE MR VSA Descriptor 10 ( 4.00 <= x < inf) | `Descriptors.SMR_VSA10` |
| 103 | **SPS** | SpacialScore descriptor (normalized) | `Descriptors.SPS` |
| 104 | **SlogP_VSA1** | MOE logP VSA Descriptor 1 (-inf < x < -0.40) | `Descriptors.SlogP_VSA1` |
| 105 | **SlogP_VSA2** | MOE logP VSA Descriptor 2 (-0.40 <= x < -0.20) | `Descriptors.SlogP_VSA2` |
| 106 | **SlogP_VSA3** | MOE logP VSA Descriptor 3 (-0.20 <= x < 0.00) | `Descriptors.SlogP_VSA3` |
| 107 | **SlogP_VSA4** | MOE logP VSA Descriptor 4 ( 0.00 <= x < 0.10) | `Descriptors.SlogP_VSA4` |
| 108 | **SlogP_VSA5** | MOE logP VSA Descriptor 5 ( 0.10 <= x < 0.15) | `Descriptors.SlogP_VSA5` |
| 109 | **SlogP_VSA6** | MOE logP VSA Descriptor 6 ( 0.15 <= x < 0.20) | `Descriptors.SlogP_VSA6` |
| 110 | **SlogP_VSA7** | MOE logP VSA Descriptor 7 ( 0.20 <= x < 0.25) | `Descriptors.SlogP_VSA7` |
| 111 | **SlogP_VSA8** | MOE logP VSA Descriptor 8 ( 0.25 <= x < 0.30) | `Descriptors.SlogP_VSA8` |
| 112 | **SlogP_VSA9** | MOE logP VSA Descriptor 9 ( 0.30 <= x < 0.40) | `Descriptors.SlogP_VSA9` |
| 113 | **SlogP_VSA10** | MOE logP VSA Descriptor 10 ( 0.40 <= x < 0.50) | `Descriptors.SlogP_VSA10` |
| 114 | **SlogP_VSA11** | MOE logP VSA Descriptor 11 ( 0.50 <= x < 0.60) | `Descriptors.SlogP_VSA11` |
| 115 | **SlogP_VSA12** | MOE logP VSA Descriptor 12 ( 0.60 <= x < inf) | `Descriptors.SlogP_VSA12` |
| 116 | **TPSA** | Topological Polar Surface Area | `Descriptors.TPSA` |
| 117 | **VSA_EState1** | VSA EState Descriptor 1 (-inf < x < 4.78) | `Descriptors.VSA_EState1` |
| 118 | **VSA_EState2** | VSA EState Descriptor 2 ( 4.78 <= x < 5.00) | `Descriptors.VSA_EState2` |
| 119 | **VSA_EState3** | VSA EState Descriptor 3 ( 5.00 <= x < 5.41) | `Descriptors.VSA_EState3` |
| 120 | **VSA_EState4** | VSA EState Descriptor 4 ( 5.41 <= x < 5.74) | `Descriptors.VSA_EState4` |
| 121 | **VSA_EState5** | VSA EState Descriptor 5 ( 5.74 <= x < 6.00) | `Descriptors.VSA_EState5` |
| 122 | **VSA_EState6** | VSA EState Descriptor 6 ( 6.00 <= x < 6.07) | `Descriptors.VSA_EState6` |
| 123 | **VSA_EState7** | VSA EState Descriptor 7 ( 6.07 <= x < 6.45) | `Descriptors.VSA_EState7` |
| 124 | **VSA_EState8** | VSA EState Descriptor 8 ( 6.45 <= x < 7.00) | `Descriptors.VSA_EState8` |
| 125 | **VSA_EState9** | VSA EState Descriptor 9 ( 7.00 <= x < 11.00) | `Descriptors.VSA_EState9` |
| 126 | **VSA_EState10** | VSA EState Descriptor 10 ( 11.00 <= x < inf) | `Descriptors.VSA_EState10` |
| 127 | **fr_Al_COO** | fragment: aliphatic carboxylic acids | `Descriptors.fr_Al_COO` |
| 128 | **fr_Al_OH** | fragment: aliphatic hydroxyl groups | `Descriptors.fr_Al_OH` |
| 129 | **fr_Al_OH_noTert** | fragment: aliphatic hydroxyl groups (no tert) | `Descriptors.fr_Al_OH_noTert` |
| 130 | **fr_ArN** | fragment: aromatic N groups | `Descriptors.fr_ArN` |
| 131 | **fr_Ar_COO** | fragment: aromatic carboxylic acids | `Descriptors.fr_Ar_COO` |
| 132 | **fr_Ar_N** | fragment: aromatic nitrogens | `Descriptors.fr_Ar_N` |
| 133 | **fr_Ar_NH** | fragment: aromatic amines | `Descriptors.fr_Ar_NH` |
| 134 | **fr_Ar_OH** | fragment: aromatic hydroxyl groups | `Descriptors.fr_Ar_OH` |
| 135 | **fr_COO** | fragment: carboxylic acids | `Descriptors.fr_COO` |
| 136 | **fr_COO2** | fragment: carboxylic acids (alternative) | `Descriptors.fr_COO2` |
| 137 | **fr_C_O** | fragment: carbonyl oxygen | `Descriptors.fr_C_O` |
| 138 | **fr_C_O_noCOO** | fragment: carbonyl O (excluding COOH) | `Descriptors.fr_C_O_noCOO` |
| 139 | **fr_C_S** | fragment: thiocarbonyl | `Descriptors.fr_C_S` |
| 140 | **fr_HOCCN** | fragment: specific C(OH)CCN patterns | `Descriptors.fr_HOCCN` |
| 141 | **fr_Imine** | fragment: imines | `Descriptors.fr_Imine` |
| 142 | **fr_NH0** | fragment: tertiary amines | `Descriptors.fr_NH0` |
| 143 | **fr_NH1** | fragment: secondary amines | `Descriptors.fr_NH1` |
| 144 | **fr_NH2** | fragment: primary amines | `Descriptors.fr_NH2` |
| 145 | **fr_N_O** | fragment: hydroxylamine groups | `Descriptors.fr_N_O` |
| 146 | **fr_Ndealkylation1** | fragment: XCCNR groups | `Descriptors.fr_Ndealkylation1` |
| 147 | **fr_Ndealkylation2** | fragment: tert-alicyclic amines | `Descriptors.fr_Ndealkylation2` |
| 148 | **fr_Nhpyrrole** | fragment: H-pyrrole nitrogens | `Descriptors.fr_Nhpyrrole` |
| 149 | **fr_SH** | fragment: thiol groups | `Descriptors.fr_SH` |
| 150 | **fr_aldehyde** | fragment: aldehydes | `Descriptors.fr_aldehyde` |
| 151 | **fr_alkyl_carbamate** | fragment: alkyl carbamates | `Descriptors.fr_alkyl_carbamate` |
| 152 | **fr_alkyl_halide** | fragment: alkyl halides | `Descriptors.fr_alkyl_halide` |
| 153 | **fr_allylic_oxid** | fragment: allylic oxidation sites | `Descriptors.fr_allylic_oxid` |
| 154 | **fr_amide** | fragment: amides | `Descriptors.fr_amide` |
| 155 | **fr_amidine** | fragment: amidines | `Descriptors.fr_amidine` |
| 156 | **fr_aniline** | fragment: anilines | `Descriptors.fr_aniline` |
| 157 | **fr_aryl_methyl** | fragment: aryl methyl sites | `Descriptors.fr_aryl_methyl` |
| 158 | **fr_azide** | fragment: azide groups | `Descriptors.fr_azide` |
| 159 | **fr_azo** | fragment: azo groups | `Descriptors.fr_azo` |
| 160 | **fr_barbitur** | fragment: barbiturates | `Descriptors.fr_barbitur` |
| 161 | **fr_benzene** | fragment: benzene rings | `Descriptors.fr_benzene` |
| 162 | **fr_benzodiazepine** | fragment: benzodiazepines | `Descriptors.fr_benzodiazepine` |
| 163 | **fr_bicyclic** | fragment: bicyclic systems | `Descriptors.fr_bicyclic` |
| 164 | **fr_diazo** | fragment: diazo groups | `Descriptors.fr_diazo` |
| 165 | **fr_dihydropyridine** | fragment: dihydropyridines | `Descriptors.fr_dihydropyridine` |
| 166 | **fr_epoxide** | fragment: epoxides | `Descriptors.fr_epoxide` |
| 167 | **fr_ester** | fragment: esters | `Descriptors.fr_ester` |
| 168 | **fr_ether** | fragment: ethers | `Descriptors.fr_ether` |
| 169 | **fr_furan** | fragment: furans | `Descriptors.fr_furan` |
| 170 | **fr_guanid** | fragment: guanidine groups | `Descriptors.fr_guanid` |
| 171 | **fr_halide** | fragment: halides | `Descriptors.fr_halide` |
| 172 | **fr_hdrzine** | fragment: hydrazines | `Descriptors.fr_hdrzine` |
| 173 | **fr_hdrzone** | fragment: hydrazones | `Descriptors.fr_hdrzone` |
| 174 | **fr_imidazole** | fragment: imidazoles | `Descriptors.fr_imidazole` |
| 175 | **fr_imide** | fragment: imides | `Descriptors.fr_imide` |
| 176 | **fr_isocyan** | fragment: isocyanates | `Descriptors.fr_isocyan` |
| 177 | **fr_isothiocyan** | fragment: isothiocyanates | `Descriptors.fr_isothiocyan` |
| 178 | **fr_ketone** | fragment: ketones | `Descriptors.fr_ketone` |
| 179 | **fr_ketone_Topliss** | fragment: ketones (Topliss) | `Descriptors.fr_ketone_Topliss` |
| 180 | **fr_lactam** | fragment: lactams | `Descriptors.fr_lactam` |
| 181 | **fr_lactone** | fragment: lactones | `Descriptors.fr_lactone` |
| 182 | **fr_methoxy** | fragment: methoxy groups | `Descriptors.fr_methoxy` |
| 183 | **fr_morpholine** | fragment: morpholines | `Descriptors.fr_morpholine` |
| 184 | **fr_nitrile** | fragment: nitriles | `Descriptors.fr_nitrile` |
| 185 | **fr_nitro** | fragment: nitro groups | `Descriptors.fr_nitro` |
| 186 | **fr_nitro_arom** | fragment: aromatic nitro groups | `Descriptors.fr_nitro_arom` |
| 187 | **fr_nitro_arom_nonortho** | fragment: non-ortho aromatic nitro groups | `Descriptors.fr_nitro_arom_nonortho` |
| 188 | **fr_nitroso** | fragment: nitroso groups | `Descriptors.fr_nitroso` |
| 189 | **fr_oxazole** | fragment: oxazoles | `Descriptors.fr_oxazole` |
| 190 | **fr_oxime** | fragment: oximes | `Descriptors.fr_oxime` |
| 191 | **fr_para_hydroxylation** | fragment: para-hydroxylation sites | `Descriptors.fr_para_hydroxylation` |
| 192 | **fr_phenol** | fragment: phenols | `Descriptors.fr_phenol` |
| 193 | **fr_phenol_noOrthoHbond** | fragment: phenols (no ortho H-bond) | `Descriptors.fr_phenol_noOrthoHbond` |
| 194 | **fr_phos_acid** | fragment: phosphoric acid groups | `Descriptors.fr_phos_acid` |
| 195 | **fr_phos_ester** | fragment: phosphoric ester groups | `Descriptors.fr_phos_ester` |
| 196 | **fr_piperdine** | fragment: piperidines | `Descriptors.fr_piperdine` |
| 197 | **fr_piperzine** | fragment: piperazines | `Descriptors.fr_piperzine` |
| 198 | **fr_priamide** | fragment: primary amides | `Descriptors.fr_priamide` |
| 199 | **fr_prisulfonamd** | fragment: primary sulfonamides | `Descriptors.fr_prisulfonamd` |
| 200 | **fr_pyridine** | fragment: pyridines | `Descriptors.fr_pyridine` |
| 201 | **fr_quatN** | fragment: quaternary nitrogens | `Descriptors.fr_quatN` |
| 202 | **fr_sulfide** | fragment: sulfides | `Descriptors.fr_sulfide` |
| 203 | **fr_sulfonamd** | fragment: sulfonamides | `Descriptors.fr_sulfonamd` |
| 204 | **fr_sulfone** | fragment: sulfones | `Descriptors.fr_sulfone` |
| 205 | **fr_term_acetylene** | fragment: terminal acetylenes | `Descriptors.fr_term_acetylene` |
| 206 | **fr_tetrazole** | fragment: tetrazoles | `Descriptors.fr_tetrazole` |
| 207 | **fr_thiazole** | fragment: thiazoles | `Descriptors.fr_thiazole` |
| 208 | **fr_thiocyan** | fragment: thiocyanates | `Descriptors.fr_thiocyan` |
| 209 | **fr_thiophene** | fragment: thiophenes | `Descriptors.fr_thiophene` |
| 210 | **fr_unbrch_alkane** | fragment: unbranched alkanes | `Descriptors.fr_unbrch_alkane` |
| 211 | **fr_urea** | fragment: ureas | `Descriptors.fr_urea` |
| 212 | **qed** | Quantitative Estimation of Drug-likeness | `Descriptors.qed` |

---
*Generated automatically by SMILESRender on 2026-04-09 using RDKit.*
