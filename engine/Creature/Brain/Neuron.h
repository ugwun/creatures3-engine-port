// Neuron.h: interface for the Neuron class.
//
//////////////////////////////////////////////////////////////////////

#ifndef Neuron_H
#define Neuron_H


#include "BrainConstants.h"

#include <vector>
struct Neuron;
typedef std::vector<Neuron*> Neurons;
typedef std::vector<Neuron*>::iterator NeuronsIterator;

struct Neuron
{
	int idInList;

	SVRuleVariables states;
	Neuron();
	void ClearStates();
};

#endif//Neuron_H
