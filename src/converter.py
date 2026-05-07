from io import BytesIO
from rdkit import Chem
from rdkit.Chem import Draw
import zipfile
import re


supported_formats = [
    "BLP",
    "BMP",
    "DDS",
    "DIB",
    "EPS",
    "GIF",
    "ICNS",
    "ICO",
    "IM",
    "JPEG",
    "MSP",
    "PCX",
    "PFM",
    "PNG",
    "PPM",
    "TIFF",
    "WEBP",
    "XBM",
]


def sanitize_file_name(name) :
    return re.sub(r"[^a-zA-Z0-9]", "", name).lower()


def valid_format(format) :
    return format.upper() in supported_formats


def convert_smiles(smiles, format) :
    if not valid_format(format):
        raise Exception("Format {} not supported.".format(format.upper()))

    molecule = Chem.MolFromSmiles(smiles)
    image = Draw.MolToImage(molecule)

    if format.upper() == "JPEG":
        image = image.convert("RGB")
    else:
        image = image.convert("RGBA")
        data = image.getdata()
        new_data = []
        for item in data:
            if item[0] > 200 and item[1] > 200 and item[2] > 200:
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(item)
        image.putdata(new_data)

    bin_image = BytesIO()
    image.save(bin_image, format.upper(), quality=95)
    bin_image.seek(0)

    return bin_image

# Optimized for high-throughput SMILES conversion and ZIP export
def convert_many_smiles_and_zip(smiles):
    zip_file = BytesIO()

    used_names_cout = {}

    with zipfile.ZipFile(zip_file, "w") as zip:
        for smile, name, format in smiles:
            format = format if valid_format(format) else "png"
            image = convert_smiles(smile, format)

            if not name:
                name = sanitize_file_name(smile)

            if name in list(used_names_cout):
                used_names_cout[name] += 1
                name = "{} {}".format(name, used_names_cout[name])

            used_names_cout[name] = 1

            zip.writestr("{}.{}".format(name, format.lower()), image.getvalue())

    zip_file.seek(0)

    return zip_file


def create_mols_grid(smiles_list, labels=None, mols_per_row=3, sub_img_size=(300, 300), format="PNG"):
    mols = []
    legends = []
    for i, smi in enumerate(smiles_list):
        mol = Chem.MolFromSmiles(smi)
        if mol:
            mols.append(mol)
            if labels and i < len(labels):
                legends.append(labels[i])
            else:
                legends.append("Compound {}".format(i+1))
    
    img = Draw.MolsToGridImage(
        mols, 
        molsPerRow=mols_per_row, 
        subImgSize=sub_img_size, 
        legends=legends,
        useSVG=False # For consistency with PNG export, but we can make it SVG if needed
    )
    
    
    buf = BytesIO()
    if format.upper() == "JPEG":
        img = img.convert("RGB")
    img.save(buf, format=format.upper(), quality=95)
    buf.seek(0)
    return buf

