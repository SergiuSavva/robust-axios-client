/**
 * Generic LRU (Least Recently Used) Cache implementation
 * Provides O(1) complexity for get/set/delete operations
 */
export class LRUCache<K, V> {
  private capacity: number;
  private cache = new Map<K, V>();

  // Using a Map for O(1) access to node positions
  private nodes = new Map<K, Node<K>>();
  private head: Node<K> | null = null;
  private tail: Node<K> | null = null;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  /**
   * Get a value from the cache
   * Accessing a value moves it to the front of the LRU list (most recently used)
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value !== undefined) {
      // Move to most recently used position
      this.markAsUsed(key);
    }

    return value;
  }

  /**
   * Set a value in the cache
   * New or updated values are placed at the front of the LRU list
   * If capacity is exceeded, the least recently used item is evicted
   */
  set(key: K, value: V): void {
    // Update existing key
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.markAsUsed(key);
      return;
    }

    // Evict least recently used if at capacity
    if (this.cache.size >= this.capacity) {
      this.evictLRU();
    }

    // Add new item
    this.cache.set(key, value);
    this.addToFront(key);
  }

  /**
   * Delete an item from the cache
   */
  delete(key: K): boolean {
    if (!this.cache.has(key)) {
      return false;
    }

    // Remove from linked list
    const node = this.nodes.get(key);
    if (node) {
      this.removeNode(node);
      this.nodes.delete(key);
    }

    // Remove from cache map
    return this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.nodes.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get all values in the cache
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * Get all entries in the cache
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  /**
   * Execute a callback for each item in the cache
   */
  forEach(callback: (value: V, key: K) => void): void {
    this.cache.forEach(callback);
  }

  /**
   * Check if the cache has a key
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Get the least recently used key (for testing/debugging)
   */
  getLRUKey(): K | undefined {
    return this.tail?.key;
  }

  /**
   * Private Methods for Doubly Linked List Operations
   */
  private markAsUsed(key: K): void {
    const node = this.nodes.get(key);
    if (node) {
      // Remove from current position
      this.removeNode(node);
      // Add to front
      this.addNodeToFront(node);
    }
  }

  private evictLRU(): void {
    if (this.tail) {
      const key = this.tail.key;
      this.removeNode(this.tail);
      this.nodes.delete(key);
      this.cache.delete(key);
    }
  }

  private addToFront(key: K): void {
    const newNode = new Node(key);
    this.nodes.set(key, newNode);
    this.addNodeToFront(newNode);
  }

  private addNodeToFront(node: Node<K>): void {
    // Set node's next/prev
    node.next = this.head;
    node.prev = null;

    // Update previous head
    if (this.head) {
      this.head.prev = node;
    }

    // Set as new head
    this.head = node;

    // If first node, also set as tail
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: Node<K>): void {
    // Connect previous node to next node
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      // Node was head
      this.head = node.next;
    }

    // Connect next node to previous node
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      // Node was tail
      this.tail = node.prev;
    }
  }
}

/**
 * Node class for the doubly linked list
 */
class Node<K> {
  key: K;
  prev: Node<K> | null = null;
  next: Node<K> | null = null;

  constructor(key: K) {
    this.key = key;
  }
}
