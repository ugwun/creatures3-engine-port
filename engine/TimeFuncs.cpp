// -------------------------------------------------------------------------
// Filename:    
// Class: 
// Purpose:     
// Description:
//
// Usage:
//
// History:
// -------------------------------------------------------------------------


#include "TimeFuncs.h"
#include <cstring>
#include <time.h>


uint32 GetRealWorldTime()
{
	return (uint32)(time(NULL));
}


int GetTimeStamp()
{
	struct timespec stamp;
	if( clock_gettime( CLOCK_MONOTONIC, &stamp ) != 0 )
		return 0;

	// Match timeGetTime(): milliseconds from a monotonic clock, with the
	// low 32 bits returned to preserve the original wraparound behaviour.
	unsigned long long milliseconds =
		(unsigned long long)stamp.tv_sec * 1000ULL +
		(unsigned long long)stamp.tv_nsec / 1000000ULL;
	return (int)(uint32)milliseconds;
}

int64 GetHighPerformanceTimeStamp()
{
	struct timespec stamp;
	if( clock_gettime( CLOCK_MONOTONIC, &stamp ) != 0 )
		return 0;

	return (int64)stamp.tv_sec * 1000000000LL + (int64)stamp.tv_nsec;
}

int64 GetHighPerformanceTimeStampFrequency()
{
	// GetHighPerformanceTimeStamp() is expressed in nanoseconds.
	return 1000000000LL;
}

// win32 replacement function
void GetLocalTime( SYSTEMTIME* t )
{
	if( !t )
		return;

	memset( t, 0, sizeof( SYSTEMTIME ) );

	struct timespec stamp;
	if( clock_gettime( CLOCK_REALTIME, &stamp ) != 0 )
		return;

	time_t seconds = stamp.tv_sec;
	struct tm local;
	if( !localtime_r( &seconds, &local ) )
		return;

	t->wYear = (uint16)(local.tm_year + 1900);
	t->wMonth = (uint16)(local.tm_mon + 1);
	t->wDayOfWeek = (uint16)local.tm_wday;
	t->wDay = (uint16)local.tm_mday;
	t->wHour = (uint16)local.tm_hour;
	t->wMinute = (uint16)local.tm_min;
	t->wSecond = (uint16)local.tm_sec;
	t->wMilliseconds = (uint16)(stamp.tv_nsec / 1000000L);
}





//Check for invalid time components
bool IsValidTime(SYSTEMTIME& time)
{
	// SYSTEMTIME uses the range 0-23, where zero is midnight.
	if(time.wHour > 23)
		return false;

	if( time.wMinute > 59)
		return false;

	if( time.wSecond > 59)
		return false;

	if( time.wMilliseconds > 999)
		return false;

	return true;
}

//Check for invalid time components
bool IsValidDate(SYSTEMTIME& time)
{
	if(time.wDay == 0 || time.wMonth == 0)
		return false;

	return true;
}

// game time must be at least one second!!
bool IsValidGameTime(SYSTEMTIME& time)
{
	if(time.wHour==0 && time.wMinute == 0 && time.wSecond ==0)
	return false;

	return true;
}
