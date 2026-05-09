// --------------------------------------------------------------------------
// Filename:	Music Timer.cpp
//
// Purpose:		GetTime() function
//
// Description:	Only included to avoid header clashes between dsound.h
//				and mmsystem.h
//
// History:
// 29Apr98	Peter	Created
// --------------------------------------------------------------------------


#include "MusicTimer.h"
#include "../../common/C2eTypes.h"

// ----------------------------------------------------------------------
// Method:		MusicGetTime
// Arguments:	None
// Returns:		See below
// Description:	The timeGetTime function retrieves the system time, in
//				milliseconds. The system time is the time elapsed since 
//				Windows was started. 
// ----------------------------------------------------------------------
int MusicGetTime()
	{
	#warning // TODO: need millisecond-resolution timestamp here!
	}
