=====
Troubleshoot
=====

Errors and Fixes
======

Error: X Error of failed request:  BadAlloc (insufficient resources for operation)

Fix: If running on a computer without X Server, make sure to run with a mock X server using xvfb-run or pre starting xvfb and setting the DISPLAY environment variable. (ex. start with 'xvfb-run -a tileserver-gl --mbtiles zurich_switzerland.mbtiles')

Error: libjpeg.so.8: cannot open shared object file: No such file or directory

Fix: You need to install libjpeg-turbo8 as a system dependency.

On Debian 11, run the following commands.

.. code-block:: bash

   wget http://archive.ubuntu.com/ubuntu/pool/main/libj/libjpeg-turbo/libjpeg-turbo8_2.0.3-0ubuntu1_amd64.deb 
   sudo apt install ./libjpeg-turbo8_2.0.3-0ubuntu1_amd64.deb

See Native dependencies in :doc:`/installation` for other system dependencies.

Error: libicui18n.so.66: cannot open shared object file: No such file or directory

Fix: You need to install libicu66 as a system dependency.

On Debian 11, run the following commands.

.. code-block:: bash

    wget http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu66_66.1-2ubuntu2_amd64.deb
    sudo apt install ./libicu66_66.1-2ubuntu2_amd64.deb

See Native dependencies in :doc:`/installation` for other system dependencies.
