// -------------------------------------------------------------------------
// Filename:    C2eDebug.cpp
// Class:       None (but see also C2eDebug.h)
// Purpose:     Provide ASSERT and output of debug strings.
// Description:
//
// Usage:
//
//
// History:
// 13Aug99  BenC  Pulled out of C2eServices.
// -------------------------------------------------------------------------


#include <stdarg.h>
#include <stdio.h>

#include "C2eDebug.h"


void OutputDebugString( const char* lpOutputString )
{
	fprintf( stderr, "%s", lpOutputString );
}



void OutputFormattedDebugString(const char* fmt, ... )
{
#ifdef _DEBUG
	char buf[512];
	va_list args;

	va_start(args, fmt);
	int len = vsprintf(buf, fmt, args);
	va_end(args);
	OutputDebugString(buf);
#endif
}


