// -------------------------------------------------------------------------
// Filename:    FlightRecorderJson.h
// Purpose:     JSON string escaping for FlightRecorder UDP records
// Description:
//   Log lines carry arbitrary engine text: tabs, control characters and
//   legacy-encoded bytes all occur. The receiver parses each datagram as
//   strict JSON, so all of them have to be escaped here. Line breaks are
//   dropped because a record is a single line.
// -------------------------------------------------------------------------
#ifndef FLIGHT_RECORDER_JSON_H
#define FLIGHT_RECORDER_JSON_H

#include <cstddef>
#include <cstdio>

// Length of the valid UTF-8 sequence at text[0], or 0 if there isn't one.
inline size_t Utf8SequenceLength(const unsigned char *text, size_t available) {
  const unsigned char lead = text[0];
  size_t length = 0;
  if (lead >= 0xC2 && lead <= 0xDF)
    length = 2;
  else if (lead >= 0xE0 && lead <= 0xEF)
    length = 3;
  else if (lead >= 0xF0 && lead <= 0xF4)
    length = 4;
  if (length == 0 || length > available)
    return 0;
  for (size_t i = 1; i < length; ++i) {
    if ((text[i] & 0xC0) != 0x80)
      return 0;
  }
  // Reject overlong forms, UTF-16 surrogates and code points past U+10FFFF.
  if ((lead == 0xE0 && text[1] < 0xA0) || (lead == 0xED && text[1] > 0x9F) ||
      (lead == 0xF0 && text[1] < 0x90) || (lead == 0xF4 && text[1] > 0x8F))
    return 0;
  return length;
}

// Writes `input` to `output` as the body of a JSON string, always
// NUL-terminated. Input that does not fit is truncated on a character
// boundary. Returns the number of bytes written.
inline size_t EscapeLogTextForJson(const char *input, size_t inputLength,
                                   char *output, size_t outputSize) {
  static const char replacement[] = "\\ufffd";
  const size_t maxEscape = 6;
  if (outputSize == 0)
    return 0;
  size_t written = 0;
  size_t i = 0;
  while (i < inputLength && written + maxEscape < outputSize) {
    const unsigned char c = static_cast<unsigned char>(input[i]);
    if (c == '\n' || c == '\r') {
      ++i;
    } else if (c == '"' || c == '\\') {
      output[written++] = '\\';
      output[written++] = static_cast<char>(c);
      ++i;
    } else if (c < 0x20 || c == 0x7F) {
      written += static_cast<size_t>(
          snprintf(output + written, outputSize - written, "\\u%04x", c));
      ++i;
    } else if (c < 0x80) {
      output[written++] = static_cast<char>(c);
      ++i;
    } else {
      const size_t sequence = Utf8SequenceLength(
          reinterpret_cast<const unsigned char *>(input + i), inputLength - i);
      if (sequence == 0) {
        for (size_t k = 0; k + 1 < sizeof(replacement); ++k)
          output[written++] = replacement[k];
        ++i;
      } else {
        for (size_t k = 0; k < sequence; ++k)
          output[written++] = input[i + k];
        i += sequence;
      }
    }
  }
  output[written] = '\0';
  return written;
}

#endif // FLIGHT_RECORDER_JSON_H
