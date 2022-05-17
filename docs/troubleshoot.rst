=====
Troubleshoot
=====

Errors and Fixes
======

Error: X Error of failed request:  BadAlloc (insufficient resources for operation)

Fix: If running on a computer without X Server, make sure to run with a mock X server using xvfb-run or pre starting xvfb and setting the DISPLAY environment variable. (ex. start with 'xvfb-run -a tileserver-gl --mbtiles zurich_switzerland.mbtiles')
