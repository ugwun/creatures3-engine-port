/*********************************************************************
* File:     CPUID.h
* Created:  10/6/98
* Author:   Robin E. Charlton
* 
* Originates from Intel Corp.
* Possibly placed in "WinMain":
*	gProcessorType = GetProcessorType();
*	gHasMMXTechnology = CheckMMXTechnology();
*
*********************************************************************/

#error non-win32 version needs work...

#ifndef CPUID_H
#define CPUID_H

const uint32 CPU_TYPE =      0x00003000;
const uint32 CPU_FAMILY =    0x00000f00;
const uint32 CPU_MODEL =     0x000000f0;
const uint32 CPU_STEPPING =  0x0000000f;

extern uint32 GetProcessorType(void);
extern bool CheckMMXTechnology(void);

#endif // CPUID_H
