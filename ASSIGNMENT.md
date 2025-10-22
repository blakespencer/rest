Build a Simple Treasury Flow - Bank Connectivity + Investment
At Rest, we help businesses earn institutional-grade yield on their idle cash by
connecting to their existing bank accounts, sweeping surplus balances into low-risk
investment funds, and giving them full visibility of liquidity and yield.
For this task, imagine we want to prototype a small end-to-end system that connects a
user’s bank account (via Plaid), shows consolidated balances, and lets them place a
simulated investment order into a money market fund (via Seccl or a mock API).

1. Connect one or more business bank accounts via Plaid (sandbox)
2. Fetch and display balances + transactions (consolidated view)
3. Simulate an investment flow:
   a. Create a “Rest Account” for the client (via Seccl sandbox or mock
   endpoints)
   b. Fund that account (simulated cash receipt)
   c. Place a “Buy” order for a money market fund
   d. Display confirmation + position summary
   You don’t need any UI polish at all - we care more about architecture, data flow, and
   security.
   Requirements
   ● Use whatever language you are comfortable with
   ● Use AI to generate the code and attach the prompts and workflow that you used
   ● Create at least 1 connected bank account via Plaid (or alternative if you prefer)
   ● Use Seccl sandbox or reasonable mocked service to show investment flows
   ● Short README with data flow diagram, architecture explanation, and how you’d
   ● harden for production (auth, reconciliation, retries).
   ● Please do not spend more than 2 hours

https://plaid.com/docs/sandbox/
https://documenter.getpostman.com/view/25484536/2s8ZDcyKSL
