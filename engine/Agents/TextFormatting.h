#ifndef TEXT_FORMATTING_H
#define TEXT_FORMATTING_H

#include <string>

// Strip DS-specific inline formatting tags (e.g. "<tint R G B>") from text.
// The DS engine uses these to colour text parts, but the C3 renderer
// draws character-by-character from a sprite sheet without colour support.
// This is a header-only utility so it can be tested without heavy engine deps.
inline std::string StripInlineFormattingTags(const std::string &text) {
  std::string result;
  result.reserve(text.size());
  size_t i = 0;
  while (i < text.size()) {
    if (text[i] == '<') {
      // Skip everything from '<' up to and including the next '>'
      size_t close = text.find('>', i);
      if (close != std::string::npos) {
        i = close + 1;
      } else {
        // No closing '>' — skip the rest of the string
        break;
      }
    } else {
      result += text[i];
      ++i;
    }
  }
  return result;
}

#endif // TEXT_FORMATTING_H
