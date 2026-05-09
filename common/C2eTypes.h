// -------------------------------------------------------------------------
// Filename:    C2eTypes.h
// Class:       None
// Purpose:     Basic datatype definitions for C2e
// Description:
//
//
// Usage:
//
//
// History:
// 03Dev98	BenC	Initial version
// -------------------------------------------------------------------------

#ifndef C2ETYPES_H
#define C2ETYPES_H


#ifndef MAX_PATH
#define MAX_PATH 512
#endif
#ifndef _MAX_PATH
#define _MAX_PATH MAX_PATH
#endif

// unambiguous basic types
typedef signed char int8;
typedef unsigned char uint8;
typedef signed short int int16;
typedef unsigned short int uint16;
typedef signed int int32;
typedef unsigned int uint32;
typedef long long int64;

// #include "Vector2D.h"

// CRect CSize etc...
#include "../engine/Display/Position.h"
#include "../engine/mfchack.h"

#define ConvertByteToFloat(aByte) (((float)aByte) / 255.0f)
#define ConvertFloatToByte(aFloat) (int)(aFloat * 255.0f)

#define GetUINT32At(bptr) (*(uint32 *)(bptr))
#define GetUINT16At(bptr) (*(uint16 *)(bptr))
#define GetUINT8At(bptr) (*(uint8 *)(bptr))

#endif // C2ETYPES_H
