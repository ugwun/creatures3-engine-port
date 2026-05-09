// Save and load state of a window
//
// Notes:
//
// You must make a call to SetRegistryKey to tell
// MFC our company name.  This is done in the application
// InitInstance function.   For example,
//
// SetRegistryKey(_T("CyberLife Technology"));
//
// Also ensure that the resource AFX_IDS_APP_TITLE is set
// to the product name.  These two pieces of information are 
// used by MFC (in GetProfileString and SetProfileString) to
// construct the registry key to use.


#ifndef WINDOW_STATE_H
#define WINDOW_STATE_H

namespace WindowState
{
	UINT Load(const char* szSection, const char* szEntry, HWND hWnd, bool bNoSize = false);
	void Save(const char* szSection, const char* szEntry, HWND hWnd);
}

#endif
