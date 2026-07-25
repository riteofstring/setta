package codexapp

func (manager *Manager) State() (ManagerState, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.state, manager.err
}

func (manager *Manager) Generation() uint64 {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.generation
}
