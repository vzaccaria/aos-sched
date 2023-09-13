
test:
	./index.js dump cfs 1 | ./index.js simulate cfs | ./index.js export complete | tikz2pdf -p
