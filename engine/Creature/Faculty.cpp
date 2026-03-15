// Faculty.cpp: implementation of the Faculty class.
//
//////////////////////////////////////////////////////////////////////


#ifdef _MSC_VER
#pragma warning(disable:4786 4503)
#endif

#include "Faculty.h"

CREATURES_IMPLEMENT_SERIAL(Faculty)


//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

Faculty::Faculty()
{

}

Faculty::~Faculty()
{

}


void Faculty::Init(AgentHandle c) {
	myCreature = c;
}

void Faculty::Update() {}

void Faculty::ReadFromGenome(Genome& g) {}

float* Faculty::GetLocusAddress(int type, int organ, int tissue, int locus) {
	return NULL;
}




bool Faculty::Write(CreaturesArchive &archive) const {
	archive << myCreature;
	return true;
}

bool Faculty::Read(CreaturesArchive &archive) 
{
	int32 version = archive.GetFileVersion();

	if(version >= 3)
	{
		// In v >= 15 (DS), the creature handle is set later via Init(),
		// not read from the archive. In v < 15 (C3), it's read here.
		if(version < 15)
		{
			archive >> myCreature;
		}

		// v39 (DS) adds an extra bool field to Faculty
		if(version > 38)
		{
			bool dummy;
			archive >> dummy;
		}
	}
	else
	{
		_ASSERT(false);
		return false;
	}
	return true;
}
