#ifndef TIMEFUNCS_H
#define TIMEFUNCS_H


#include "../common/C2eTypes.h"
#include <string>
#include <vector>



// a win32 structure
typedef struct _SYSTEMTIME
{
	uint16 wYear;
	uint16 wMonth;
    uint16 wDayOfWeek;
	uint16 wDay;
	uint16 wHour;
	uint16 wMinute;
    uint16 wSecond;
	uint16 wMilliseconds;
} SYSTEMTIME;



bool IsValidTime(SYSTEMTIME& time);
bool IsValidDate(SYSTEMTIME& time);
bool IsValidGameTime(SYSTEMTIME& time);

// moved here from Display/Window.h
void GetLocalTime( SYSTEMTIME* t );
int GetTimeStamp();
int64 GetHighPerformanceTimeStamp();
int64 GetHighPerformanceTimeStampFrequency();

// seconds since midnight (00:00:00), January 1, 1970 UTC
uint32 GetRealWorldTime();


#endif // TIMEFUNCS_H

