import { Injectable } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  async getAllByOwner(user: Users): Promise<any> {
    return this.projectsRepository.find({ owner: user });
  }
}
