// stub_Orderiser.cpp
// No-op stub for Orderiser — used by MacroScript::Write/Read during
// serialization, which our tests never invoke.
#include "engine/Caos/Orderiser.h"

Orderiser::Orderiser() {}
Orderiser::~Orderiser() {}
MacroScript* Orderiser::OrderFromCAOS(const char*) { return nullptr; }
