// -------------------------------------------------------------------------
// Filename:    C2eServices.h
// Class:       None (but see also C2eDebug.cpp)
// Purpose:     Provide ASSERT and debug string output. 
// Description:
//
// Usage:
//
//
// History:
// 13Aug99  BenC  Pulled out of C2eServices
// -------------------------------------------------------------------------


#ifndef C2EDEBUG_H
#define C2EDEBUG_H


void OutputFormattedDebugString(const char* fmt, ... );

#include <assert.h>
#define ASSERT assert
#define _ASSERT assert
void OutputDebugString( const char* lpOutputString );
#ifndef NDEBUG
#define _DEBUG
#endif

#endif // C2EDEBUG_H

