const hosts = [];
let selectedHost = null;

const ips = [];

function fetchHosts() {
    fetch('/api/hosts')
        .then(response => response.json())
        .then(response => {
            // clear hosts
            hosts.splice(0, hosts.length);
            // add new hosts
            hosts.push(...response.data);
        });
}

function fetchIps(host) {
    fetch(`/api/${host}/ips`)
        .then(response => response.json())
        .then(response => {
            // clear ips
            ips.splice(0, ips.length);

            const data = response.data.map(line => {
                const [int, ip, _, __, status, protocol] = line.split(/\s+/);
                return { int, ip, status: status == "administratively" ? "administratively down" : status, protocol }
            })

            console.log(data)

            ips.push(...data);
        });
}

document.onload = fetchHosts();