
test: 
	bun test

test-%:
	./index.ts dump cfs $* | ./index.ts simulate cfs | ./index.ts export complete | tikz2pdf -p
