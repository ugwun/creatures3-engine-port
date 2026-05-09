// -------------------------------------------------------------------------
// Filename:    CAOSException.h
// Class:       CAOSException
// Purpose:
// Description:
//
//
// Usage:
//
//
// History:
// -------------------------------------------------------------------------

#ifdef OBSOLETE


#ifndef CAOSEXCEPTION_H
#define CAOSEXCEPTION_H



class CAOSException
{
public:
	CAOSException( const char* fmt, ... );
	CAOSException()
		{ myMessage[0] = '\0'; }

	const char* what()
		{ return myMessage; }
private:
	char myMessage[512];
};

#endif // CAOSEXCEPTION_H


#endif // OBSOLETE
