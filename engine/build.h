
#define MAJOR_VER 1
#define MINOR_VER 154

#include <sstream>

inline std::string GetEngineVersion()
{
	std::ostringstream out;
	out << MAJOR_VER << "." << MINOR_VER;
	return out.str();
}

inline int GetMinorEngineVersion()
{
	return MINOR_VER;
}

inline int GetMajorEngineVersion()
{
	return MAJOR_VER;
}
