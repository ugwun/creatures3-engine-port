// MonikerGeneration.cpp
// Moniker generation number calculation — shared between the engine
// (GenomeStore.cpp) and unit tests (test_GenomeStore.cpp).
//
// Extracted to avoid circular dependencies while ensuring production
// code and tests use the exact same implementation.

#include "GenomeStore.h"
#include <string>

// CalculateGenerationNumber
//
// Parse the generation number from one or two parent moniker seeds.
// Monikers start with a 3-digit zero-padded decimal generation (e.g. "001").
//
// Rules:
//   - Crossover (both seeds non-empty): max(gen1, gen2) + 1
//   - Clone (seed1 non-empty, seed2 empty): preserve gen1
//   - Engineered (both seeds empty): 0+1 = 1
//   - Result clamped to [0, 999] for moniker format compatibility.
int GenomeStore::CalculateGenerationNumber(const std::string &monikerSeed1,
                                           const std::string &monikerSeed2) {
  int generationOne = 0, generationTwo = 0;

  if (monikerSeed1.size() >= 3) {
    generationOne = (monikerSeed1[0] - '0') * 100 +
                     (monikerSeed1[1] - '0') * 10 +
                     (monikerSeed1[2] - '0');
  }
  if (monikerSeed2.size() >= 3) {
    generationTwo = (monikerSeed2[0] - '0') * 100 +
                     (monikerSeed2[1] - '0') * 10 +
                     (monikerSeed2[2] - '0');
  }

  // Generation number defined as Max+1 (Because Helen Birchmore (Yes Blame
  // her!) said so :)
  int ownGeneration =
      (generationOne < generationTwo) ? generationTwo + 1 : generationOne + 1;
  // special case for cloning to preserve generation
  if (!monikerSeed1.empty() && monikerSeed2.empty())
    ownGeneration = generationOne;
  // Clamp to 3 digits for moniker format compatibility (32 chars total)
  if (ownGeneration < 0)
    ownGeneration = 0;
  if (ownGeneration > 999)
    ownGeneration = 999;

  return ownGeneration;
}
