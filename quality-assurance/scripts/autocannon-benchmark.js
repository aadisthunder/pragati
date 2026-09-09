/**
 * Pragati Single-Instance Local Capacity Benchmark
 * Measures raw throughput, latency (p50, p95, p99), and error rates.
 *
 * Usage:
 *   node quality-assurance/scripts/autocannon-benchmark.js
 */

import autocannon from 'autocannon';

async function runBenchmark() {
  const targetUrl = process.env.API_URL || 'http://localhost:5000/health';
  console.log(`Starting Pragati Single-Instance Capacity Benchmark on ${targetUrl}...`);

  const instance = autocannon(
    {
      url: targetUrl,
      connections: 50, // 50 concurrent connections
      duration: 10,    // 10 seconds test
      pipelining: 1,
      headers: {
        'content-type': 'application/json',
      },
    },
    (err, result) => {
      if (err) {
        console.error('Benchmark failed:', err);
        return;
      }
      console.log('\n========================================');
      console.log('       PRAGATI BENCHMARK RESULTS        ');
      console.log('========================================');
      console.log(`Average Requests/Sec: ${result.requests.average.toFixed(2)}`);
      console.log(`Total Requests:       ${result.requests.total}`);
      console.log(`Throughput:           ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
      console.log(`Latency p50 (median): ${result.latency.p50} ms`);
      console.log(`Latency p95:          ${result.latency.p95} ms`);
      console.log(`Latency p99:          ${result.latency.p99} ms`);
      console.log(`Errors:               ${result.errors}`);
      console.log(`Timeouts:             ${result.timeouts}`);
      console.log('========================================\n');
    }
  );

  autocannon.track(instance, { renderProgressBar: true });
}

runBenchmark();
