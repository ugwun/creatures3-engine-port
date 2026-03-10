// stub_Catalogue.cpp
// Minimal stub for Catalogue, used by tests that compile Genome.cpp.
// Only GenomeInitFailedException::GenomeInitFailedException() calls
// theCatalogue.Get() — all other Genome logic avoids it.
// We stub only the non-inline methods so the linker is satisfied.

#include "common/Catalogue.h"
#include "engine/C2eServices.h" // extern Catalogue theCatalogue;

// Global catalogue instance referenced as an extern in C2eServices.h
// and used by Genome.cpp via GenomeInitFailedException.
Catalogue theCatalogue;

// Non-inline method stubs (everything else is inline in Catalogue.h)
Catalogue::Catalogue() : myNextFreeId(0) {}

void Catalogue::Clear() {
  myStrings.clear();
  myTags.clear();
  myNextFreeId = 0;
}

void Catalogue::AddFile(const std::string &, const std::string &) {}
void Catalogue::AddDir(const std::string &, const std::string &) {}
void Catalogue::AddLocalisedFile(const std::string &) {}
bool Catalogue::AddTagFromFile(const std::string &, const std::string &,
                               const std::string &) {
  return false;
}
void Catalogue::DumpStrings(std::ostream &) {}
void Catalogue::DumpTags(std::ostream &) {}

// Catalogue::Err constructor (used by inline Get() methods)
Catalogue::Err::Err(const char *fmt, ...) : BasicException(fmt) {}
