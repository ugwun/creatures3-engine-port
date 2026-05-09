#ifndef VELOCITY_VARIABLE_H
#define VELOCITY_VARIABLE_H


#include "CAOSVar.h"


class VelocityVariable : public CAOSVar
{
public:
	VelocityVariable();		// not defined
	VelocityVariable(float& floatref, bool& stoppedref):
		myFloatReference(floatref),
		myStoppedReference(stoppedref)
	{
	}

protected:

	virtual void Get( const int type, PolyVar& data ) const;
	virtual void Set( const int type, const PolyVar& data );

	float&	myFloatReference;
	bool& myStoppedReference;

private:
	// Declared but not defined
	VelocityVariable(const VelocityVariable& var);
	VelocityVariable& operator=(const VelocityVariable& var);
};

#endif // VELOCITY_VARIABLE_H
