package types

import (
	"io"

	"github.com/attic-labs/noms/chunks"
	"github.com/attic-labs/noms/ref"
)

// BatchStore provides an interface similar to chunks.ChunkStore, but batch-oriented. Instead of Put(), it provides SchedulePut(), which enqueues a Chunk to be sent at a possibly later time.
type BatchStore interface {
	// Get returns from the store the Value Chunk by r. If r is absent from the store, chunks.EmptyChunk is returned.
	Get(r ref.Ref) chunks.Chunk

	// SchedulePut enqueues a write for the Chunk c, using the provided hints to assist in validation. It may or may not block until c is persisted. Validation requires checking that all refs embedded in c are themselves valid, which could naively be done by resolving each one. Instead, hints provides a (smaller) set of refs that point to Chunks that themselves contain many of c's refs. Thus, by checking only the hinted Chunks, c can be validated with fewer read operations.
	// c may or may not be persisted when Put() returns, but is guaranteed to be persistent after a call to Flush() or Close().
	SchedulePut(c chunks.Chunk, hints Hints)

	// Flush causes enqueued Puts to be persisted.
	Flush()
	io.Closer
}

// Hints are a set of hashes that should be used to speed up the validation of one or more Chunks.
type Hints map[ref.Ref]struct{}

// BatchStoreAdaptor provides a naive implementation of BatchStore should only be used with ChunkStores that can Put relatively quickly. It provides no actual batching or validation. Its intended use is for adapting a ChunkStore for use in something that requires a BatchStore.
type BatchStoreAdaptor struct {
	cs chunks.ChunkStore
}

// NewBatchStoreAdaptor returns a BatchStore instance backed by a ChunkStore. Takes ownership of cs and manages its lifetime; calling Close on the returned BatchStore will Close cs.
func NewBatchStoreAdaptor(cs chunks.ChunkStore) BatchStore {
	return &BatchStoreAdaptor{cs}
}

// Get simply proxies to the backing ChunkStore
func (lbs *BatchStoreAdaptor) Get(ref ref.Ref) chunks.Chunk {
	return lbs.cs.Get(ref)
}

// SchedulePut simply calls Put on the underlying ChunkStore, and ignores hints.
func (lbs *BatchStoreAdaptor) SchedulePut(c chunks.Chunk, hints Hints) {
	lbs.cs.Put(c)
}

// Flush is a noop.
func (lbs *BatchStoreAdaptor) Flush() {}

// Close closes the underlying ChunkStore
func (lbs *BatchStoreAdaptor) Close() error {
	lbs.Flush()
	return lbs.cs.Close()
}