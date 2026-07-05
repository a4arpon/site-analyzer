# site-analyzer


Build Result
```sh
➜  site-analyzer git:(main) deno task build:compile
Task build:compile deno compile --target x86_64-unknown-linux-gnu ./src/app.ts
Check src/app.ts
Compile src/app.ts to app

Embedded Files

app
└── src/* (656B)

Files: 2.34KB
Metadata: 1.48KB
Remote modules: 12B

➜  site-analyzer git:(main ?:1) ✗ ls -lh ./app
-rwxr-xr-x 1 a4arpon a4arpon 104M Jul  6 04:02 ./app
➜  site-analyzer git:(main ?:1) ✗
```
