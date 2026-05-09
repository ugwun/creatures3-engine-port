// stub_GenomeDeps.cpp
// Satisfies linker dependencies for test_Genome not covered by test_stubs,
// stub_File.cpp, or stub_FilePath.cpp.
//
//   - GenomeStore::MonikerAsString() / GenomeStore::Filename()
//     Only called from Genome(GenomeStore&,...) — a constructor we never
//     invoke.

#include "engine/Creature/GenomeStore.h"
#include <string>

std::string GenomeStore::MonikerAsString(int) { return ""; }
std::string GenomeStore::Filename(std::string) { return ""; }
