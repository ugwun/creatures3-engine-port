#ifndef REQUEST_MANAGER_H
#define REQUEST_MANAGER_H

#include "../../common/C2eTypes.h"
// TODO: ServerSide should be fwd declaration
#include "../../common/ServerSide.h"

class RequestManager
{
public:
	void HandleIncoming( ServerSide& server );
};

#endif // REQUEST_MANAGER_H
