// --------------------------------------------------------------------------
// Filename:	Music Wave.h
// Class:		MusicWave
// Purpose:		Stores information about waves used within the music manager
//
// Description:
//
// Although initially this is nothing more than a name store, eventually
// this will contain additional information
//
// History:
// 17Apr98	PeterC	Created
// --------------------------------------------------------------------------

#ifndef _MUSIC_WAVE_H

#define _MUSIC_WAVE_H



#include "MusicNamedItem.h"

class MusicWave : public MusicNamedItem
	{
	public:
		// ----------------------------------------------------------------------
		// Method:		MusicWave
		// Arguments:	None
		// Returns:		Nothing
		// Description:	Default Constructor
		// ----------------------------------------------------------------------
		MusicWave() {}

		// ----------------------------------------------------------------------
		// Method:		MusicWave
		// Arguments:	newName - name of the object
		// Returns:		Nothing
		// Description:	Constructor
		// ----------------------------------------------------------------------
		MusicWave(const char* newName) : MusicNamedItem(newName) {}

		// ----------------------------------------------------------------------
		// Method:		~MusicWave
		// Arguments:	None
		// Returns:		Nothing
		// Description:	Default Destructor
		// ----------------------------------------------------------------------
		~MusicWave() {}


	};

#endif