
#include "../engine/Display/Position.h"
#include "../engine/CreaturesArchive.h"



CreaturesArchive &operator<<( CreaturesArchive &archive, const Position &position )
{
	archive << position.myX << position.myY;
	return archive;
}

CreaturesArchive &operator>>( CreaturesArchive &archive, Position &position )
{
	archive >> position.myX >> position.myY;
	return archive;
}
