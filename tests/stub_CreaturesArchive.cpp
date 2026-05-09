// stub_CreaturesArchive.cpp
// Provides no-op implementations of the CreaturesArchive methods
// referenced by CAOSVar.cpp (for test_CAOSVar only).
//
// CAOSVar::Write(CreaturesArchive&) and Read(CreaturesArchive&) call
// the archive's primitives — but our tests never invoke those methods.
// These stubs satisfy the linker without pulling in the full
// CreaturesArchive.cpp (which requires App.h → Display/Window.h → SDL).

#include "engine/CreaturesArchive.h"

int32 CreaturesArchive::GetFileVersion() { return 0; }

void CreaturesArchive::Write(float) {}
void CreaturesArchive::Write(int32) {}
void CreaturesArchive::Write(const std::string &) {}

void CreaturesArchive::Read(float &f) { f = 0.f; }
void CreaturesArchive::Read(int32 &i) { i = 0; }
void CreaturesArchive::Read(std::string &s) { s.clear(); }

void CreaturesArchive::Write(uint32)            {}
void CreaturesArchive::Read(uint32& i)          { i = 0; }
void CreaturesArchive::Read(PersistentObject*& p) { p = nullptr; }

void CreaturesArchive::Write(const PersistentObject* p) {}
void CreaturesArchive::Write(const void* data, size_t n) {}
void CreaturesArchive::Read(void* data, size_t n)        {}
