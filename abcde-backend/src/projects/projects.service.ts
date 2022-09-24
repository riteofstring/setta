import { Injectable } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(private readonly projects: ProjectsRepository) {}

  async getAllByOwner(user: Users): Promise<any> {
    return this.projects.find({ owner: user });
  }

  async loadOne(id: string): Promise<any> {
    const project = await this.projects.findOne(
      { id },
      { populate: ['sectionGroup.children'] },
    );
    const sections = project.sectionGroup.children;
    return sections;
  }
}
