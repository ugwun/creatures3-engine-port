// NeuroEmitter.h: interface for the NeuroEmitter class.
//
//////////////////////////////////////////////////////////////////////
#ifndef NeuroEmitter_H
#define NeuroEmitter_H


#include "../Definitions.h"
#include "../../CreaturesArchive.h"

struct NeuroEmitter {
	NeuroEmitter();

	enum {noOfNeuronalInputs=3};
	enum {noOfChemicalEmissions=4};

	float bioTickRate;
	float bioTick;

	float* myNeuronalInputs[noOfNeuronalInputs];
	struct ChemicalEmission {
		int chemicalId;
		float amount;
	} myChemicalEmissions[noOfChemicalEmissions];

	bool Write(CreaturesArchive &archive) const;
	bool Read(CreaturesArchive &archive);
	static float myDefaultNeuronInput;
};


#endif//NeuroEmitter_H