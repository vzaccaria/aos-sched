
test-%:
	./index.js dump cfs $* | ./index.js simulate cfs | ./index.js export complete | tikz2pdf -p
