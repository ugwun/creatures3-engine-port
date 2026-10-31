// -------------------------------------------------------------------------
// Filename:    DebugServerWork.h
// Purpose:     Hand-off of API work from HTTP threads to the main thread
// Description:
//   An HTTP thread queues a WorkItem and waits. If the wait times out, a
//   queued item must not run later: the client has been told the request
//   failed, so a delayed mutation would change the world behind its back.
//   Each item is therefore claimed exactly once, by the main thread to run it
//   or by the waiter to abandon it. A 504 then means the work never ran.
// -------------------------------------------------------------------------
#ifndef DEBUG_SERVER_WORK_H
#define DEBUG_SERVER_WORK_H

#include <atomic>
#include <chrono>
#include <functional>
#include <future>
#include <memory>
#include <string>

enum class WorkItemState { Queued, Claimed, Abandoned };

class WorkFuture {
public:
	WorkFuture(
		std::future<std::string> future,
		std::shared_ptr<std::atomic<WorkItemState>> state)
		: myFuture(std::move(future)), myState(std::move(state)) {}

	template <typename Rep, typename Period>
	std::future_status wait_for(
		const std::chrono::duration<Rep, Period>& timeout) {
		const std::future_status status = myFuture.wait_for(timeout);
		if (status == std::future_status::ready)
			return status;
		WorkItemState expected = WorkItemState::Queued;
		if (myState->compare_exchange_strong(
				expected, WorkItemState::Abandoned))
			return status;
		// Already running on the main thread, which cannot be interrupted.
		// Its result is the only honest answer, so wait for it.
		myFuture.wait();
		return std::future_status::ready;
	}

	std::string get() { return myFuture.get(); }

private:
	std::future<std::string> myFuture;
	std::shared_ptr<std::atomic<WorkItemState>> myState;
};

struct WorkItem {
	std::function<std::string()> work;
	std::promise<std::string> promise;
	std::shared_ptr<std::atomic<WorkItemState>> state =
		std::make_shared<std::atomic<WorkItemState>>(WorkItemState::Queued);

	WorkFuture get_future() {
		return WorkFuture(promise.get_future(), state);
	}

	// Called on the main thread. False means the waiter gave up: do not run.
	bool Claim() {
		WorkItemState expected = WorkItemState::Queued;
		return state->compare_exchange_strong(
			expected, WorkItemState::Claimed);
	}
};

#endif // DEBUG_SERVER_WORK_H
