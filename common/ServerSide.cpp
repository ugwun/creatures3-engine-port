#include "ServerSide.h"

ServerSide::ServerSide() {}
bool ServerSide::Create(const char *servername, unsigned int maxsize) {
  return false;
}
void ServerSide::Close() {}
bool ServerSide::Wait() { return false; }
unsigned int ServerSide::GetRequestSize() { return 0; }
unsigned char *ServerSide::GetBuffer() { return nullptr; }
void ServerSide::Respond(unsigned int resultsize, int returncode) {}
unsigned int ServerSide::GetMaxBufferSize() { return 0; }
void ServerSide::Cleanup() {}
