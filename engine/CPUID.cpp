/*********************************************************************
* File:     CPUID.cpp
* Created:  10/6/98
* Author:   Robin E. Charlton
*********************************************************************/

#include "../common/C2eTypes.h"
#include "CPUID.h"

// Globals:
bool gIsPentiumProcessor = false;
bool gIsPentiumProProcessor = false;
bool gIsPentiumIIProcessor = false;
bool gHasMMXTechnology = false;
uint32 gProcessorType;

uint32 GetProcessorType(void) { return 0; }
bool CheckMMXTechnology(void) { return false; }
