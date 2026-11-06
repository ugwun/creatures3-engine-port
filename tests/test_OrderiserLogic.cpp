#include <gtest/gtest.h>

#include "Caos/Orderiser_Logic.h"

TEST(OrderiserLogicTest, DescribesSubcommandSignatureWithTypes) {
	EXPECT_EQ(OrderiserLogic::DescribeSignature("HIST MON1", "si",
		"moniker event_no"),
		"HIST MON1 moniker (string) event_no (integer)");
}

TEST(OrderiserLogicTest, SkipsSubcommandMarkersAndPlaceholders) {
	EXPECT_EQ(OrderiserLogic::DescribeSignature("HIST", "*", ""), "HIST");
	EXPECT_EQ(OrderiserLogic::DescribeSignature("GOTO", "-#", "destination"),
		"GOTO destination (label)");
}

TEST(OrderiserLogicTest, ToleratesMissingHelpNames) {
	EXPECT_EQ(OrderiserLogic::DescribeSignature("MVTO", "ff", "x"),
		"MVTO x (float) (float)");
	EXPECT_EQ(OrderiserLogic::DescribeSignature("STOP", "", ""), "STOP");
}

TEST(OrderiserLogicTest, AppendsCommandContextOnlyWhenKnown) {
	EXPECT_EQ(OrderiserLogic::AddCommandContext(
		"Expected numeric rvalue at token ''", "HIST MON1 moniker (string)"),
		"Expected numeric rvalue at token ''; parsing HIST MON1 moniker "
		"(string)");
	EXPECT_EQ(OrderiserLogic::AddCommandContext("Unknown command", ""),
		"Unknown command");
}
