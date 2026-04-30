from admet_ai import ADMETModel
model = ADMETModel()
preds = model.predict("c1ccccc1")
print(sorted(list(preds.keys())))
